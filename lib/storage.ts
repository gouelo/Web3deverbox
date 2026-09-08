import { AppError } from "./server";
import { canSee, type Member, type Ticket, type Photo, type Update, type Status, MAX_PHOTO_BYTES } from "./domain";

const TABLE = "kesher_requests";
const BUCKET = "kesher-photos";
class BackendError extends Error { constructor(public status: number, public code: string) { super(`Storage service responded ${status} (${code})`); } }
function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError(503,"המערכת עדיין לא חוברה לשמירה המשותפת. צריך להשלים את חיבור האחסון לפני שמתחילים לעבוד.");
  const headers: Record<string,string> = {apikey:key};
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return {url:url.replace(/\/$/,""),headers};
}
async function backend(path: string, init: RequestInit = {}) {
  const c = config();
  const res = await fetch(c.url+path,{...init,headers:{...c.headers,...init.headers},cache:"no-store",signal:AbortSignal.timeout(15000)});
  if (!res.ok) {
    const error = await res.json().catch(()=>({}));
    if (error.code === "42P01" || error.code === "PGRST205") throw new AppError(503,"צריך להשלים את ההגדרה הראשונית של שמירת הבקשות.");
    throw new BackendError(res.status,String(error.code || error.statusCode || "unavailable"));
  }
  return res;
}
export async function listTickets(member: Member): Promise<Ticket[]> {
  const filter = member.role === "sales" ? `&creator_id=eq.${member.id}` : "";
  const result: Ticket[] = [];
  // PostgREST caps a response. Walk ranges so older requests never disappear.
  for (let offset=0;;offset+=500) {
    const res = await backend(`/rest/v1/${TABLE}?select=id,number,title,kind,creator_id,status,due_date,revision,created_at,updated_at,images&order=created_at.desc,id.desc${filter}`,{headers:{Range:`${offset}-${offset+499}`,"Range-Unit":"items"}});
    const rows = await res.json() as Ticket[]; result.push(...rows);
    if (rows.length < 500) return result;
  }
}
export async function getTicket(id: string, member: Member): Promise<Ticket> {
  const res = await backend(`/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*`);
  const rows = await res.json() as Ticket[];
  if (!rows[0] || !canSee(member,rows[0])) throw new AppError(404,"הבקשה לא נמצאה ברשימת הבקשות שלך.");
  return rows[0];
}
export async function createTicket(ticket: Omit<Ticket,"number">, member: Member) {
  try { const res=await backend(`/rest/v1/${TABLE}`,{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(ticket)}); return {ticket:(await res.json())[0] as Ticket,replay:false}; }
  catch(error) {
    if (error instanceof BackendError && error.code === "23505") { const prior=await getTicket(ticket.id,member); if(prior.creator_id!==member.id)throw new AppError(409,"מזהה הבקשה כבר בשימוש."); return {ticket:prior,replay:true}; }
    throw error;
  }
}
export async function saveUpdate(ticket: Ticket, update: Update, member: Member, action: "comment"|"update"|"reopen") {
  if (ticket.updates.some(u=>u.id===update.id)) return {ticket,replay:true};
  const patch: Partial<Ticket> = {updates:[...ticket.updates,update],revision:ticket.revision+1,updated_at:update.created_at};
  if(action!=="comment") { patch.status=update.status as Status;patch.due_date=update.due_date??null;patch.estimate=update.estimate||""; }
  const res = await backend(`/rest/v1/${TABLE}?id=eq.${ticket.id}&revision=eq.${ticket.revision}`,{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(patch)});
  const rows = await res.json() as Ticket[];
  if (rows[0]) return {ticket:rows[0],replay:false};
  const current=await getTicket(ticket.id,member);
  if(current.updates.some(u=>u.id===update.id))return {ticket:current,replay:true};
  throw new AppError(409,"נוסף עדכון לבקשה בזמן שכתבת. העדכון שלך נשמר בטופס; רענן את הבקשה ונסה שוב.");
}
function mimeOf(bytes: Uint8Array): string | null {
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.length>8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return "image/png";
  if(bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
  return null;
}
export async function uploadPhoto(file: File, operation: string): Promise<Photo> {
  if(file.size<1||file.size>MAX_PHOTO_BYTES)throw new AppError(400,"התמונה גדולה מדי. נסה לבחור אותה שוב כדי לכווץ אותה.");
  const buffer=await file.arrayBuffer(); const mime=mimeOf(new Uint8Array(buffer));
  if(!mime)throw new AppError(400,"אפשר לצרף תמונות JPG, PNG או WebP בלבד.");
  const id=crypto.randomUUID(); const extension=mime==="image/jpeg"?"jpg":mime==="image/png"?"png":"webp";
  const path=`${operation}/${id}.${extension}`;
  await backend(`/storage/v1/object/${BUCKET}/${path}`,{method:"POST",headers:{"Content-Type":mime,"x-upsert":"false"},body:buffer});
  return {id,path,name:file.name.slice(0,160),mime,size:file.size};
}
export async function removeUnusedPhotos(photos: Photo[]) {
  if(!photos.length)return;
  try { await backend(`/storage/v1/object/${BUCKET}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:photos.map(p=>p.path)})}); }
  catch { console.error("Unused photo cleanup deferred"); }
}
export async function readPhoto(photo: Photo) {
  const res=await backend(`/storage/v1/object/authenticated/${BUCKET}/${photo.path}`);
  return new Response(res.body,{headers:{"Content-Type":photo.mime,"Content-Disposition":"inline","X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=300"}});
}

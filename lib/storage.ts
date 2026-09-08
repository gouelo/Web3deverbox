import {del,list,put} from "@vercel/blob";
import {AppError} from "./server";
import {canSee,type Member,type Ticket,type Photo,type Update,MAX_PHOTO_BYTES} from "./domain";

type BaseRecord={type:"ticket";ticket:Omit<Ticket,"updates">};
type UpdateRecord={type:"update";ticket_id:string;update:Update};
type RecordEntry=BaseRecord|UpdateRecord;

function ready(){if(!process.env.BLOB_READ_WRITE_TOKEN&&!process.env.BLOB_STORE_ID)throw new AppError(503,"צריך להפעיל את האחסון של Vercel לפני שמתחילים לעבוד.");}
async function allJson(prefix="requests/"){
  ready();const urls:string[]=[];let cursor:string|undefined;
  do{const page=await list({prefix,limit:1000,cursor});urls.push(...page.blobs.filter(b=>b.pathname.endsWith(".json")).map(b=>b.url));cursor=page.hasMore?page.cursor:undefined;}while(cursor);
  return Promise.all(urls.map(async url=>{const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error("Blob read failed");return response.json() as Promise<RecordEntry>;}));
}
function assemble(records:RecordEntry[]):Ticket[]{
  const bases=records.filter((r):r is BaseRecord=>r.type==="ticket"),updates=records.filter((r):r is UpdateRecord=>r.type==="update");
  return bases.map(({ticket})=>{const history=updates.filter(u=>u.ticket_id===ticket.id).map(u=>u.update).sort((a,b)=>a.created_at.localeCompare(b.created_at));const result={...ticket,updates:history,revision:1+history.length} as Ticket;for(const update of history){result.updated_at=update.created_at;if(update.status){result.status=update.status;result.due_date=update.due_date??null;result.estimate=update.estimate||"";}}return result;});
}
export async function listTickets(member:Member){return assemble(await allJson()).filter(t=>canSee(member,t)).sort((a,b)=>b.created_at.localeCompare(a.created_at));}
export async function getTicket(id:string,member:Member){const ticket=assemble(await allJson(`requests/${id}/`))[0];if(!ticket||!canSee(member,ticket))throw new AppError(404,"הבקשה לא נמצאה ברשימת הבקשות שלך.");return ticket;}
async function writeJson(path:string,value:RecordEntry){try{await put(path,JSON.stringify(value),{access:"public",addRandomSuffix:false,allowOverwrite:false,contentType:"application/json"});return true;}catch(error){if(String(error).includes("already exists")||String(error).includes("409"))return false;throw error;}}
export async function createTicket(ticket:Omit<Ticket,"number">,member:Member){const number=(await allJson()).filter(r=>r.type==="ticket").length+1,complete={...ticket,number} as Ticket;const created=await writeJson(`requests/${ticket.id}/ticket.json`,{type:"ticket",ticket:complete});if(!created){const prior=await getTicket(ticket.id,member);if(prior.creator_id!==member.id)throw new AppError(409,"מזהה הבקשה כבר בשימוש.");return {ticket:prior,replay:true};}return {ticket:complete,replay:false};}
export async function saveUpdate(ticket:Ticket,update:Update,member:Member,_action:"comment"|"update"|"reopen"){
  const current=await getTicket(ticket.id,member);if(current.updates.some(u=>u.id===update.id))return {ticket:current,replay:true};if(current.revision!==ticket.revision)throw new AppError(409,"נוסף עדכון לבקשה בזמן שכתבת. העדכון שלך נשמר בטופס; רענן את הבקשה ונסה שוב.");
  const created=await writeJson(`requests/${ticket.id}/updates/${update.id}.json`,{type:"update",ticket_id:ticket.id,update});if(!created)return {ticket:await getTicket(ticket.id,member),replay:true};return {ticket:{...current,updates:[...current.updates,update],revision:current.revision+1},replay:false};
}
function mimeOf(bytes:Uint8Array){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";if(bytes.length>8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return "image/png";if(bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";return null;}
export async function uploadPhoto(file:File,operation:string):Promise<Photo>{ready();if(file.size<1||file.size>MAX_PHOTO_BYTES)throw new AppError(400,"התמונה גדולה מדי. נסה לבחור אותה שוב כדי לכווץ אותה.");const bytes=new Uint8Array(await file.arrayBuffer()),mime=mimeOf(bytes);if(!mime)throw new AppError(400,"אפשר לצרף תמונות JPG, PNG או WebP בלבד.");const id=crypto.randomUUID(),extension=mime==="image/jpeg"?"jpg":mime==="image/png"?"png":"webp";const blob=await put(`photos/${operation}/${id}.${extension}`,bytes,{access:"public",addRandomSuffix:false,contentType:mime});return {id,path:blob.url,name:file.name.slice(0,160),mime,size:file.size};}
export async function removeUnusedPhotos(photos:Photo[]){if(!photos.length)return;try{await del(photos.map(p=>p.path));}catch{console.error("Unused photo cleanup deferred");}}
export async function readPhoto(photo:Photo){const response=await fetch(photo.path,{cache:"no-store"});if(!response.ok)throw new AppError(404,"התמונה לא נמצאה.");return new Response(response.body,{headers:{"Content-Type":photo.mime,"Content-Disposition":"inline","X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=300"}});}

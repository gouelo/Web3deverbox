import {z} from "zod";
import {currentMember,requireAppRequest,reply,handleError,AppError} from "@/lib/server";
import {listTickets,getTicket,createTicket,saveUpdate,uploadPhoto,removeUnusedPhotos} from "@/lib/storage";
import {MAX_PHOTOS,MAX_PHOTO_BYTES,statuses,isClosed,type Photo,type Ticket,type Update} from "@/lib/domain";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=z.string().uuid();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s).nullable();
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),mutation_id:uuid,title:z.string().trim().min(3).max(160),description:z.string().trim().max(10000).default(""),kind:z.enum(["issue","request","idea","improvement"])}),
  z.object({action:z.literal("comment"),mutation_id:uuid,id:uuid,body:z.string().trim().max(5000)}),
  z.object({action:z.literal("update"),mutation_id:uuid,id:uuid,revision:z.number().int().positive(),body:z.string().trim().max(5000),status:z.enum(["new","in_progress","waiting","done","rejected"]),due_date:date,estimate:z.string().trim().max(300).default("")}),
  z.object({action:z.literal("reopen"),mutation_id:uuid,id:uuid,revision:z.number().int().positive(),body:z.string().trim().max(5000).default("")}),
]);
export async function GET(request:Request){try{const member=await currentMember();const id=new URL(request.url).searchParams.get("ticket");if(id){if(!uuid.safeParse(id).success)throw new AppError(404,"הבקשה לא נמצאה.");return reply({ticket:await getTicket(id,member)});}return reply({member,tickets:await listTickets(member)});}catch(e){return handleError(e);}}
export async function POST(request:Request){
  const uploaded:Photo[]=[];
  let databaseAttempted=false;
  try{
    requireAppRequest(request);const member=await currentMember();
    if(request.headers.get("x-workspace-profile")!==member.id)throw new AppError(409,"השם שנבחר השתנה בלשונית אחרת. יש לרענן את האתר לפני שמירה.");
    const size=Number(request.headers.get("content-length")||0);if(size>3500000)throw new AppError(413,"הקבצים גדולים מדי. אפשר לצרף עד 3 תמונות בכל פעם.");
    const form=await request.formData();const raw=form.get("payload");if(typeof raw!=="string"||raw.length>15000)throw new AppError(400,"פרטי הבקשה לא תקינים.");
    let p;try{p=schema.parse(JSON.parse(raw));}catch{throw new AppError(400,"יש לבדוק את הכותרת ואת הפרטים שמילאת.");}
    const files=form.getAll("photos").filter((f):f is File=>f instanceof File&&f.size>0);
    if(files.length>MAX_PHOTOS||files.some(f=>f.size>MAX_PHOTO_BYTES))throw new AppError(400,"אפשר לצרף עד 3 תמונות. תמונה גדולה תכווץ בעת הבחירה.");
    let ticket:Ticket|undefined;
    if(p.action!=="create"){
      ticket=await getTicket(p.id,member);
      if(ticket.updates.some(u=>u.id===p.mutation_id))return reply({ok:true,id:ticket.id});
      if(p.action==="update"&&member.role==="sales")throw new AppError(403,"עדכון סטטוס זמין ל־Web 3D, ליואל ולאביעד.");
      if(p.action==="reopen"&&!isClosed(ticket))throw new AppError(400,"הבקשה כבר פתוחה.");
      if(p.action!=="comment"&&p.revision!==ticket.revision)throw new AppError(409,"הבקשה עודכנה בינתיים. רענן את פרטי הבקשה ונסה שוב; הטקסט והתמונות יישארו בטופס.");
      if(p.action==="comment"&&!p.body&&!files.length)throw new AppError(400,"צריך לכתוב תגובה או לצרף תמונה.");
    }
    for(const file of files)uploaded.push(await uploadPhoto(file,p.mutation_id));
    const now=new Date().toISOString();
    databaseAttempted=true;
    if(p.action==="create"){
      const result=await createTicket({id:p.mutation_id,title:p.title,description:p.description,kind:p.kind,creator_id:member.id,status:"new",due_date:null,estimate:"",revision:1,created_at:now,updated_at:now,images:uploaded,updates:[]},member);
      if(result.replay)await removeUnusedPhotos(uploaded);
      return reply({ok:true,id:result.ticket.id},201);
    }
    const update:Update={id:p.mutation_id,actor_id:member.id,body:p.body,created_at:now,images:uploaded};
    if(p.action==="update"){
      update.status=p.status;update.due_date=p.due_date;update.estimate=p.estimate;
      if(!p.body&&p.status===ticket!.status&&p.due_date===ticket!.due_date&&p.estimate===ticket!.estimate&&!files.length)throw new AppError(400,"לא השתנה דבר. אפשר לכתוב עדכון או לצרף תמונה.");
      const changes:string[]=[];
      if(p.status!==ticket!.status)changes.push(`סטטוס: ${statuses[p.status]}`);
      if(p.due_date!==ticket!.due_date)changes.push(`תאריך יעד: ${p.due_date||"טרם נקבע"}`);
      if(p.estimate!==ticket!.estimate)changes.push(`הערכת זמן: ${p.estimate||"טרם נמסרה"}`);
      update.body=[...changes,p.body].filter(Boolean).join("\n");
    }
    if(p.action==="reopen"){update.status="new";update.due_date=null;update.estimate="";update.body=p.body||"הבעיה עדיין קיימת — הבקשה נפתחה מחדש.";}
    const result=await saveUpdate(ticket!,update,member,p.action);
    if(result.replay)await removeUnusedPhotos(uploaded);
    return reply({ok:true,id:result.ticket.id});
  }catch(e){
    // Do not delete photos after an uncertain database timeout: the write may
    // have committed. An idempotent retry recovers the existing request/update.
    if(!databaseAttempted||e instanceof AppError)await removeUnusedPhotos(uploaded);
    return handleError(e);
  }
}

import {z} from "zod";
import {currentMember,handleError,AppError} from "@/lib/server";
import {getTicket,readPhoto} from "@/lib/storage";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{imageId:string}>}){try{const member=await currentMember();const {imageId}=await params;const id=new URL(request.url).searchParams.get("ticket");if(!z.string().uuid().safeParse(id).success)throw new AppError(404,"התמונה לא נמצאה.");const ticket=await getTicket(id!,member);const photo=[...ticket.images,...ticket.updates.flatMap(u=>u.images)].find(p=>p.id===imageId);if(!photo)throw new AppError(404,"התמונה לא נמצאה.");return await readPhoto(photo);}catch(e){return handleError(e);}}

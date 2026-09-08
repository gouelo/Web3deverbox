import { cookies } from "next/headers";
import { findMember } from "@/lib/domain";
import { selectedMember, requireAppRequest, PROFILE_COOKIE, reply, handleError, AppError } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(){return reply({member:await selectedMember()||null});}
export async function POST(request:Request){try{requireAppRequest(request);const p=await request.json();const member=findMember(p.memberId);if(!member)throw new AppError(400,"צריך לבחור שם מהרשימה.");(await cookies()).set(PROFILE_COOKIE,member.id,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/"});return reply({member});}catch(e){return handleError(e);}}
export async function DELETE(request:Request){try{requireAppRequest(request);(await cookies()).delete(PROFILE_COOKIE);return reply({ok:true});}catch(e){return handleError(e);}}

import { cookies } from "next/headers";
import { findMember, type Member } from "./domain";

export const PROFILE_COOKIE = "kesher_profile";
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
// Profile selection is deliberately not authentication. Anyone with the link
// can select any of the six profiles, as explicitly requested by the owner.
export async function selectedMember(): Promise<Member | undefined> { return findMember((await cookies()).get(PROFILE_COOKIE)?.value); }
export async function currentMember(): Promise<Member> { const member = await selectedMember(); if (!member) throw new AppError(401,"צריך לבחור מי אתה כדי להמשיך."); return member; }
export function requireAppRequest(request: Request) { if (request.headers.get("x-workspace-request") !== "1") throw new AppError(403,"הבקשה אינה תקינה."); }
export function reply(data: unknown, status = 200) { return Response.json(data,{ status,headers:{"Cache-Control":"private, no-store"} }); }
export function handleError(error: unknown) {
  if (error instanceof AppError) return reply({error:error.message},error.status);
  console.error("Workspace request failed", error instanceof Error ? error.message : "Unexpected error");
  return reply({error:"לא הצלחנו לשמור כרגע. הפרטים והתמונות נשארו כאן, אפשר לנסות שוב."},500);
}

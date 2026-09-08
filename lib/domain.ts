export const members = [
  { id: "yitzhak", name: "יצחק", role: "sales" },
  { id: "yosef", name: "יוסף חיים", role: "sales" },
  { id: "daniel", name: "דניאל", role: "sales" },
  { id: "yoel", name: "יואל", role: "manager" },
  { id: "aviad", name: "אביעד", role: "manager" },
  { id: "web3d", name: "Web 3D", role: "agency" },
] as const;
export type Member = (typeof members)[number];
export type MemberId = Member["id"];
export const statuses = { new: "חדש", in_progress: "בטיפול", waiting: "ממתין למידע", done: "טופל", rejected: "לא ניתן לבצע" } as const;
export type Status = keyof typeof statuses;
export const kinds = { issue: "תקלה", request: "בקשה", idea: "רעיון", improvement: "הצעת ייעול" } as const;
export type Kind = keyof typeof kinds;
export type Photo = { id: string; path: string; name: string; mime: string; size: number };
export type Update = { id: string; actor_id: MemberId; body: string; created_at: string; images: Photo[]; status?: Status; due_date?: string | null; estimate?: string };
export type Ticket = {
  id: string; number: number; title: string; description: string; kind: Kind; creator_id: MemberId;
  status: Status; due_date: string | null; estimate: string; revision: number;
  created_at: string; updated_at: string; images: Photo[]; updates: Update[];
};
export function findMember(id: string | undefined | null) { return members.find(m => m.id === id); }
export function isClosed(t: Pick<Ticket,"status">) { return t.status === "done" || t.status === "rejected"; }
export function canSee(member: Member, ticket: Pick<Ticket,"creator_id">) { return member.role !== "sales" || ticket.creator_id === member.id; }
export function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function overdue(t: Pick<Ticket,"status"|"due_date">) { return !isClosed(t) && !!t.due_date && t.due_date < today(); }
export function shortDate(value: string) { return new Intl.DateTimeFormat("he-IL", { day:"numeric", month:"short", timeZone:"Asia/Jerusalem" }).format(new Date(value.length === 10 ? value+"T12:00:00Z" : value)); }
export function imageUrl(ticketId: string, imageId: string) { return `/api/images/${encodeURIComponent(imageId)}?ticket=${encodeURIComponent(ticketId)}`; }
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 900000;

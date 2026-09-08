"use client";

import {useState,useEffect,useCallback,useRef,type FormEvent} from "react";
import {Plus,ArrowLeft,ChevronLeft,Camera,ImagePlus,X,MessageSquare,CalendarDays,RefreshCw,Check,UserRound,Images,Inbox,LoaderCircle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Skeleton} from "@/components/ui/skeleton";
import {Empty} from "@/components/ui/empty";
import {Toaster} from "@/components/ui/sonner";
import {toast} from "sonner";
import {members,findMember,statuses,kinds,isClosed,overdue,shortDate,imageUrl,MAX_PHOTOS,type Member,type Ticket,type Photo,type Status,type Kind} from "@/lib/domain";
import {preparePhoto} from "@/lib/photos";

async function request<T>(url:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(url,{...init,cache:"no-store"});
  const body=await response.json().catch(()=>({error:"החיבור לא זמין כרגע. אפשר לנסות שוב."}));
  if(!response.ok)throw new Error(body.error||"הפעולה לא הושלמה.");
  return body;
}
async function save(payload:Record<string,unknown>,photos:File[],memberId:string){
  const form=new FormData();form.set("payload",JSON.stringify(payload));photos.forEach(f=>form.append("photos",f));
  return request<{ok:boolean;id:string}>("/api/workspace",{method:"POST",headers:{"X-Workspace-Request":"1","X-Workspace-Profile":memberId},body:form});
}
function Brand(){return <div className="brand"><span className="brand-mark"><i/><i/><i/><i/></span><strong>קשר</strong><span className="brand-company">EVERBOX</span></div>;}
function Avatar({member}:{member:Member}){return <span className={`avatar avatar-${member.role}`}>{member.id==="web3d"?"W":member.name[0]}</span>;}
function StatusBadge({status}:{status:Status}){return <span className={`status status-${status}`}>{status=== "done"&&<Check size={14}/>} {statuses[status]}</span>;}
function Choice({value,onChange,options,label,id}:{value:string;onChange:(s:string)=>void;options:Record<string,string>;label:string;id?:string}){return <Select dir="rtl" value={value} onValueChange={onChange}><SelectTrigger id={id} aria-label={label} className="choice"><SelectValue/></SelectTrigger><SelectContent position="popper">{Object.entries(options).map(([v,label])=><SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>;}

export default function Workspace(){
  const [member,setMember]=useState<Member|null>(null);
  const [initial,setInitial]=useState(true);
  const [choosing,setChoosing]=useState<string|null>(null);
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("open");
  const [newOpen,setNewOpen]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const profileRef=useRef<string|null>(null);

  useEffect(()=>{let live=true;request<{member:Member|null}>("/api/session").then(d=>{if(live){setMember(d.member);profileRef.current=d.member?.id||null;}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setInitial(false);});return()=>{live=false;};},[]);
  const load=useCallback(async()=>{
    if(!member)return;const id=member.id;setLoading(true);
    try{const d=await request<{member:Member;tickets:Ticket[]}>("/api/workspace");if(profileRef.current!==id)return;if(d.member.id!==id){setTickets([]);profileRef.current=d.member.id;setMember(d.member);return;}setTickets(d.tickets);setError("");}
    catch(e){if(profileRef.current===id)setError((e as Error).message);}
    finally{if(profileRef.current===id)setLoading(false);}
  },[member]);
  useEffect(()=>{if(!member)return;void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},30000);return()=>clearInterval(timer);},[member,load]);
  async function choose(person:Member){if(choosing)return;setChoosing(person.id);setError("");try{const d=await request<{member:Member}>("/api/session",{method:"POST",headers:{"Content-Type":"application/json","X-Workspace-Request":"1"},body:JSON.stringify({memberId:person.id})});profileRef.current=d.member.id;setTickets([]);setMember(d.member);setFilter("open");}catch(e){setError((e as Error).message);}finally{setChoosing(null);}}
  async function changeMember(){try{await request("/api/session",{method:"DELETE",headers:{"X-Workspace-Request":"1"}});profileRef.current=null;setMember(null);setTickets([]);setSelected(null);setError("");}catch(e){toast.error((e as Error).message);}}
  const open=tickets.filter(t=>!isClosed(t));
  const closed=tickets.filter(isClosed);
  const visible=(filter==="open"?open:filter==="closed"?closed:tickets).slice().sort((a,b)=>Number(overdue(b))-Number(overdue(a))||b.created_at.localeCompare(a.created_at));

  return <><Toaster dir="rtl" position="bottom-center"/>
    {!member?<main className="welcome"><Brand/><div className="welcome-title"><h1>מי אתה?</h1><p>בחר את השם שלך כדי לראות את הבקשות.</p></div>{initial?<div className="profile-grid">{members.map(m=><Skeleton key={m.id} className="profile-skeleton"/>)}</div>:<div className="profile-grid">{members.map(m=><Button key={m.id} variant="outline" className="profile-card" onClick={()=>void choose(m)} disabled={!!choosing}><Avatar member={m}/><strong>{m.name}</strong><span>{m.role==="sales"?"הבקשות שלי":m.role==="agency"?"טיפול בכל הבקשות":"כל הבקשות"}</span>{choosing===m.id?<LoaderCircle className="profile-arrow spin" size={18}/>:<ArrowLeft className="profile-arrow" size={18}/>}</Button>)}</div>}{error&&<p className="error" role="alert">{error}</p>}</main>:<>
      <header className="topbar"><div className="topbar-inner"><Brand/><div className="current-person"><Avatar member={member}/><strong>{member.name}</strong><Button variant="ghost" className="switch-person" onClick={()=>void changeMember()}><UserRound size={15}/><span>החלפת שם</span></Button></div></div></header>
      <main className="workspace"><div className="heading"><div><p>שלום, {member.name}</p><h1>{member.role==="sales"?"הבקשות שלי":"כל הבקשות"}</h1></div><Button className="primary" onClick={()=>setNewOpen(true)}><Plus size={19}/>בקשה חדשה</Button></div>
        <div className="list-toolbar"><Tabs dir="rtl" value={filter} onValueChange={setFilter}><TabsList aria-label="סינון בקשות"><TabsTrigger value="open">פתוחות <span>{open.length}</span></TabsTrigger><TabsTrigger value="closed">נסגרו <span>{closed.length}</span></TabsTrigger><TabsTrigger value="all">הכול <span>{tickets.length}</span></TabsTrigger></TabsList></Tabs><Button variant="ghost" size="icon" title="רענון בקשות" aria-label="רענון בקשות" onClick={()=>void load()}><RefreshCw size={17} className={loading?"spin":""}/></Button></div>
        {error&&<div className="error" role="alert"><p>{error}</p><Button variant="outline" onClick={()=>void load()}>ניסיון נוסף</Button></div>}
        {loading&&!tickets.length?<div className="request-list">{[1,2,3].map(n=><Skeleton key={n} className="request-skeleton"/>)}</div>:!visible.length?<Empty className="empty"><div className="empty-icon"><Inbox size={31}/></div><h2>{error?"הבקשות עדיין לא נטענו":tickets.length?"אין בקשות ברשימה הזאת":"עדיין אין כאן בקשות"}</h2><p>{error?"אפשר לנסות שוב לאחר שהחיבור לשמירה יהיה מוכן.":tickets.length?"אפשר לעבור ללשונית אחרת כדי לראות אותן.":"יש תקלה, בקשה או רעיון? מתחילים כאן."}</p>{!tickets.length&&!error&&<Button variant="outline" onClick={()=>setNewOpen(true)}><Plus size={17}/>פתיחת בקשה ראשונה</Button>}</Empty>:<div className="request-list">{visible.map(t=><Button key={t.id} variant="outline" className="request-card" onClick={()=>setSelected(t.id)}><div className="request-main"><div className="request-line"><span className="request-number">#{t.number}</span><span className="kind-label">{kinds[t.kind]}</span></div><h2>{t.title}</h2><div className="request-meta">{member.role!=="sales"&&<span>{findMember(t.creator_id)?.name}</span>}<span>{shortDate(t.created_at)}</span>{!!t.images.length&&<span><Images size={14}/>{t.images.length}</span>}{t.due_date&&<span className={overdue(t)?"late":""}><CalendarDays size={14}/>{overdue(t)?"עבר היעד: ":"צפי: "}{shortDate(t.due_date)}</span>}</div></div><div className="request-end"><StatusBadge status={t.status}/><ChevronLeft size={20}/></div></Button>)}</div>}
        <p className="list-note">הבקשות מתעדכנות אוטומטית. כל השיחה נשארת בתוך הבקשה.</p>
      </main>
      <NewRequest open={newOpen} onClose={()=>setNewOpen(false)} member={member} onSaved={id=>{setNewOpen(false);void load();setSelected(id);}}/>
      <RequestDetail key={`${member.id}:${selected||"none"}`} id={selected} member={member} onClose={()=>setSelected(null)} onSaved={()=>void load()}/>
    </>}
  </>;
}

function PhotoPicker({files,onChange,onBusy,disabled=false}:{files:File[];onChange:(f:File[])=>void;onBusy:(busy:boolean)=>void;disabled?:boolean}){
  const camera=useRef<HTMLInputElement>(null);const gallery=useRef<HTMLInputElement>(null);const active=useRef(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [previews,setPreviews]=useState<{file:File;url:string}[]>([]);
  useEffect(()=>{const items=files.map(file=>({file,url:URL.createObjectURL(file)}));setPreviews(items);return()=>items.forEach(i=>URL.revokeObjectURL(i.url));},[files]);
  async function add(input:HTMLInputElement){if(active.current)return;active.current=true;setBusy(true);onBusy(true);setError("");const added:File[]=[];try{const selected=Array.from(input.files||[]);if(selected.length+files.length>MAX_PHOTOS)throw new Error("אפשר לצרף עד 3 תמונות בכל פעם.");for(const file of selected)added.push(await preparePhoto(file));onChange([...files,...added]);}catch(e){setError((e as Error).message);}finally{input.value="";setBusy(false);onBusy(false);active.current=false;}}
  return <div className="photo-picker"><div className="photo-buttons"><Button type="button" variant="outline" onClick={()=>camera.current?.click()} disabled={disabled||busy||files.length>=MAX_PHOTOS}><Camera size={17}/>צילום</Button><Button type="button" variant="outline" onClick={()=>gallery.current?.click()} disabled={disabled||busy||files.length>=MAX_PHOTOS}><ImagePlus size={17}/>העלאת תמונה</Button><span>{busy?"מכין את התמונות…":files.length?`${files.length} מתוך 3 תמונות`:"לא חובה"}</span></div><input className="sr-only" tabIndex={-1} aria-label="צילום תמונה" ref={camera} type="file" accept="image/*" capture="environment" onChange={e=>void add(e.currentTarget)}/><input className="sr-only" tabIndex={-1} aria-label="בחירת תמונות" ref={gallery} type="file" accept="image/*" multiple onChange={e=>void add(e.currentTarget)}/>{!!previews.length&&<div className="photo-previews">{previews.map((p,i)=><div key={p.url}><img src={p.url} alt={`תמונה מצורפת ${i+1}`}/><Button type="button" variant="secondary" size="icon" disabled={disabled||busy} aria-label={`הסרת תמונה ${i+1}`} onClick={()=>onChange(files.filter((_,n)=>n!==i))}><X size={14}/></Button></div>)}</div>}{error&&<p className="field-error" role="alert">{error}</p>}</div>;
}

function Photos({photos,ticketId}:{photos:Photo[];ticketId:string}){
  const [selected,setSelected]=useState<Photo|null>(null);
  if(!photos.length)return null;
  return <><div className="saved-photos">{photos.map((p,i)=><Button variant="ghost" type="button" key={p.id} className="photo-thumbnail" onClick={()=>setSelected(p)} aria-label={`פתיחת תמונה ${i+1}`}><img src={imageUrl(ticketId,p.id)} alt={p.name||`תמונה ${i+1}`} loading="lazy"/></Button>)}</div><Dialog open={!!selected} onOpenChange={v=>!v&&setSelected(null)}><DialogContent dir="rtl" className="image-dialog"><DialogTitle className="sr-only">תמונה מצורפת</DialogTitle><DialogDescription className="sr-only">תמונה שנוספה לבקשה או לעדכון.</DialogDescription>{selected&&<img src={imageUrl(ticketId,selected.id)} alt={selected.name||"תמונה מצורפת"}/>}</DialogContent></Dialog></>;
}

function NewRequest({open,onClose,member,onSaved}:{open:boolean;onClose:()=>void;member:Member;onSaved:(id:string)=>void}){
  const [title,setTitle]=useState("");const [description,setDescription]=useState("");const [kind,setKind]=useState<Kind>("issue");const [photos,setPhotos]=useState<File[]>([]);const [busy,setBusy]=useState(false);const [preparing,setPreparing]=useState(false);const [error,setError]=useState("");const operation=useRef("");
  async function submit(e:FormEvent){e.preventDefault();if(busy||preparing)return;setBusy(true);setError("");operation.current ||= crypto.randomUUID();try{const result=await save({action:"create",mutation_id:operation.current,title,description,kind},photos,member.id);setTitle("");setDescription("");setPhotos([]);setKind("issue");operation.current="";onSaved(result.id);toast.success("הבקשה נפתחה");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Dialog open={open} onOpenChange={v=>!v&&!busy&&!preparing&&onClose()}><DialogContent dir="rtl" className="request-dialog"><DialogHeader><DialogTitle>בקשה חדשה</DialogTitle><DialogDescription>מה צריך לתקן או לקדם?</DialogDescription></DialogHeader><form className="form" onSubmit={submit}><label className="field"><span>כותרת</span><Input value={title} onChange={e=>setTitle(e.target.value)} required minLength={3} maxLength={160} placeholder="למשל: האוטומציה שלי לא שולחת התראות"/></label><div className="field"><label htmlFor="new-kind">סוג הבקשה</label><Choice id="new-kind" label="סוג הבקשה" value={kind} onChange={v=>setKind(v as Kind)} options={kinds}/></div><label className="field"><span>עוד פרטים <small>לא חובה</small></span><Textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={10000} rows={3} placeholder="אפשר לתאר כאן מה קרה או מה היית רוצה לשפר."/></label><PhotoPicker files={photos} onChange={setPhotos} onBusy={setPreparing} disabled={busy}/>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><Button type="submit" className="primary" disabled={busy||preparing}>{busy?<><LoaderCircle className="spin" size={17}/>שומר…</>:<>פתיחת בקשה<ArrowLeft size={17}/></>}</Button><Button type="button" variant="ghost" disabled={busy||preparing} onClick={onClose}>ביטול</Button></div></form></DialogContent></Dialog>;
}

function RequestDetail({id,member,onClose,onSaved}:{id:string|null;member:Member;onClose:()=>void;onSaved:()=>void}){
  const [ticket,setTicket]=useState<Ticket|null>(null);const [loading,setLoading]=useState(false);const [loadError,setLoadError]=useState("");const [body,setBody]=useState("");const [status,setStatus]=useState<Status>("new");const [due,setDue]=useState("");const [photos,setPhotos]=useState<File[]>([]);const [busy,setBusy]=useState(false);const [preparing,setPreparing]=useState(false);const [error,setError]=useState("");const operation=useRef("");const reopening=useRef("");const handler=member.role!=="sales";
  const load=useCallback(async(initialize=false,signal?:AbortSignal)=>{if(!id)return;setLoading(true);try{const d=await request<{ticket:Ticket}>(`/api/workspace?ticket=${encodeURIComponent(id)}`,{signal});setTicket(d.ticket);setLoadError("");if(initialize){setStatus(d.ticket.status);setDue(d.ticket.due_date||"");}}catch(e){if((e as Error).name!=="AbortError")setLoadError((e as Error).message);}finally{setLoading(false);}},[id]);
  useEffect(()=>{const controller=new AbortController();void load(true,controller.signal);return()=>controller.abort();},[load]);
  async function submit(e:FormEvent){e.preventDefault();if(!ticket||busy||preparing)return;setBusy(true);setError("");operation.current ||= crypto.randomUUID();try{const payload:Record<string,unknown>={action:handler?"update":"comment",id:ticket.id,mutation_id:operation.current,body};if(handler)Object.assign(payload,{revision:ticket.revision,status,due_date:due||null,estimate:ticket.estimate});await save(payload,photos,member.id);operation.current="";setBody("");setPhotos([]);await load(true);onSaved();toast.success("העדכון נשמר");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function reopen(){if(!ticket||busy)return;setBusy(true);setError("");reopening.current ||= crypto.randomUUID();try{await save({action:"reopen",id:ticket.id,mutation_id:reopening.current,revision:ticket.revision,body:"הבעיה עדיין קיימת — הבקשה נפתחה מחדש."},[],member.id);reopening.current="";await load(true);onSaved();toast.success("הבקשה נפתחה מחדש");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Sheet open={!!id} onOpenChange={v=>!v&&!busy&&!preparing&&onClose()}><SheetContent side="left" dir="rtl" showCloseButton={false} className="detail-sheet"><SheetHeader className="detail-header"><div><span className="detail-number">{ticket?`בקשה #${ticket.number}`:"פרטי בקשה"}</span><SheetTitle>{ticket?.title||"טוען את הבקשה…"}</SheetTitle><SheetDescription>{ticket?`${findMember(ticket.creator_id)?.name} · ${shortDate(ticket.created_at)}`:"פרטי הבקשה והעדכונים"}</SheetDescription></div><Button variant="ghost" size="icon" aria-label="סגירת הבקשה" disabled={busy||preparing} onClick={onClose}><X size={21}/></Button></SheetHeader><div className="detail-body">
    {loadError&&<div className="error" role="alert"><p>{loadError}</p><Button variant="outline" onClick={()=>void load(!ticket)}>ניסיון נוסף</Button></div>}
    {!ticket&&!loadError?<><Skeleton className="detail-skeleton"/><Skeleton className="detail-skeleton"/></>:ticket&&<>
      <div className="detail-status"><StatusBadge status={ticket.status}/>{ticket.due_date&&<span className={overdue(ticket)?"late":""}><CalendarDays size={16}/>צפי: {shortDate(ticket.due_date)}</span>}{ticket.estimate&&<span>{ticket.estimate}</span>}</div>
      {ticket.description&&<p className="description">{ticket.description}</p>}<Photos photos={ticket.images} ticketId={ticket.id}/>
      <section className="updates"><div className="section-heading"><h2>עדכונים</h2><Button variant="ghost" size="icon" aria-label="רענון פרטי הבקשה" disabled={busy} onClick={()=>void load(false)}><RefreshCw size={15} className={loading?"spin":""}/></Button></div>{ticket.updates.length?ticket.updates.map(u=><article key={u.id} className="update"><div className="update-heading"><Avatar member={findMember(u.actor_id)||members[3]}/><strong>{findMember(u.actor_id)?.name}</strong><time>{shortDate(u.created_at)} · {new Intl.DateTimeFormat("he-IL",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jerusalem"}).format(new Date(u.created_at))}</time></div>{u.body&&<p>{u.body}</p>}<Photos photos={u.images} ticketId={ticket.id}/></article>):<p className="no-updates">עדיין אין עדכונים לבקשה הזאת.</p>}</section>
      <form className="form update-form" onSubmit={submit}><h2>{handler?"עדכון טיפול":"הוספת תגובה"}</h2>{handler&&<div className="form-row"><div className="field"><label htmlFor="update-status">סטטוס</label><Choice id="update-status" label="עדכון סטטוס" value={status} onChange={v=>setStatus(v as Status)} options={statuses}/></div><label className="field"><span>צפי לטיפול <small>לא חובה</small></span><Input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label></div>}<label className="field"><span>{handler?"מה חדש?":"התגובה שלך"}</span><Textarea value={body} onChange={e=>setBody(e.target.value)} rows={3} maxLength={5000} placeholder={handler?"אפשר לעדכן מה בוצע ולצרף צילום של הפתרון.":"אפשר להוסיף מידע, לשאול שאלה או לצרף תמונה."}/></label><PhotoPicker files={photos} onChange={setPhotos} onBusy={setPreparing} disabled={busy}/>{error&&<div className="error" role="alert"><p>{error}</p><Button type="button" variant="outline" onClick={()=>void load(false)} disabled={busy}>רענון הבקשה</Button></div>}<Button type="submit" className="primary" disabled={busy||preparing||(!handler&&!body.trim()&&!photos.length)}>{busy?<><LoaderCircle className="spin" size={17}/>שומר…</>:<>{handler?"שמירת עדכון":"שליחת תגובה"}<Check size={17}/></>}</Button></form>
      {isClosed(ticket)&&<Button className="reopen-button" variant="outline" disabled={busy||preparing} onClick={()=>void reopen()}><RefreshCw size={16}/>הבעיה עדיין קיימת? פתיחה מחדש</Button>}
    </>}
  </div></SheetContent></Sheet>;
}

import {MAX_PHOTO_BYTES} from "./domain";
export async function preparePhoto(file:File):Promise<File>{
  if(!file.type.startsWith("image/"))throw new Error("צריך לבחור קובץ תמונה.");
  if(file.size>25000000)throw new Error("התמונה גדולה מדי. נסה לצרף צילום קטן יותר.");
  if(file.size<=MAX_PHOTO_BYTES&&["image/jpeg","image/png","image/webp"].includes(file.type))return file;
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error("לא הצלחנו לפתוח את התמונה. נסה צילום מסך או תמונת JPG."));img.src=url;});
    let scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement("canvas");
    for(let attempt=0;attempt<4;attempt++){
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("הדפדפן לא הצליח להכין את התמונה.");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.86-attempt*.08));
      if(blob&&blob.size<=MAX_PHOTO_BYTES)return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});
      scale*=.8;
    }
    throw new Error("לא הצלחנו להקטין את התמונה. נסה צילום מסך שלה.");
  }finally{URL.revokeObjectURL(url);}
}

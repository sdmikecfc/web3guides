const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const DB='mk-personal-banners-1';
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('banners');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function readBanner(id?:string):Promise<Blob|null>{const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('banners').objectStore('banners').get(id??'current');r.onsuccess=()=>resolve(r.result instanceof Blob?r.result:null);r.onerror=()=>reject(r.error)})}finally{db.close()}}
export async function saveBanner(blob:Blob|null){const id=blob?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join(''):null;const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('banners','readwrite');if(blob){tx.objectStore('banners').put(blob,'current');tx.objectStore('banners').put(blob,id!);}else tx.objectStore('banners').delete('current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});return id;}finally{db.close()}}
export async function decodeBanner(file:Blob){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
 if(file.size>5*1024*1024)throw Error('Choose an image smaller than 5 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);let width=0,height=0;
 if(file.type==='image/png'&&bytes.length>24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)){width=view.getUint32(16);height=view.getUint32(20)}
 else if(file.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){let offset=2;while(offset+9<bytes.length){if(bytes[offset]!==255)break;const marker=bytes[offset+1];if(marker===217||marker===218)break;const size=view.getUint16(offset+2);if(size<2||offset+2+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=view.getUint16(offset+5);width=view.getUint16(offset+7);break}offset+=size+2;}}
 else if(file.type==='image/webp'&&bytes.length>=30&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){
  const format=String.fromCharCode(...bytes.slice(12,16));if(format==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)}else if(format==='VP8L'&&bytes[20]===47){const bits=view.getUint32(21,true);width=1+(bits&16383);height=1+((bits>>>14)&16383)}else if(format==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383}}
 if(!width||!height)throw Error('This file is not a supported PNG, JPEG or WebP image.');
 if(width*height>16_000_000)throw Error('Choose an image with no more than 16 million pixels.');
 const bitmap=await createImageBitmap(file);
 if(bitmap.width*bitmap.height>16_000_000){bitmap.close();throw Error('Choose an image with no more than 16 million pixels.')}
 return bitmap;
}
export function cropBanner(bitmap:ImageBitmap,zoom=1,x=.5,y=.5){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=768;const ctx=canvas.getContext('2d')!;
 const scale=Math.max(512/bitmap.width,768/bitmap.height)*clamp(zoom,1,3),w=512/scale,h=768/scale;
 ctx.fillStyle='#202b32';ctx.fillRect(0,0,512,768);ctx.drawImage(bitmap,(bitmap.width-w)*clamp(x,0,1),(bitmap.height-h)*clamp(y,0,1),w,h,0,0,512,768);return canvas;
}
export function bannerCanvasBlob(canvas:HTMLCanvasElement):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('This image could not be prepared.')),'image/png'))}

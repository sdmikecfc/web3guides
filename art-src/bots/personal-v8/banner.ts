import * as T from 'three';
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
 const scale=Math.max(512/bitmap.width,768/bitmap.height)*T.MathUtils.clamp(zoom,1,3),w=512/scale,h=768/scale;
 ctx.fillStyle='#202b32';ctx.fillRect(0,0,512,768);ctx.drawImage(bitmap,(bitmap.width-w)*T.MathUtils.clamp(x,0,1),(bitmap.height-h)*T.MathUtils.clamp(y,0,1),w,h,0,0,512,768);return canvas;
}
export function bannerCanvasBlob(canvas:HTMLCanvasElement):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('This image could not be prepared.')),'image/png'))}
function emblem(){const c=document.createElement('canvas');c.width=512;c.height=768;const x=c.getContext('2d')!;x.fillStyle='#173e47';x.fillRect(0,0,512,768);x.strokeStyle='#d5ba7e';x.lineWidth=14;x.strokeRect(30,30,452,708);x.fillStyle='#dfc58a';x.font='bold 145px Georgia';x.textAlign='center';x.fillText('MK',256,410);return c}
/** Pure presentation: no collision proxies, GP, combat RNG or equipment slots. */
export function createBanner(){
 const texture=new T.CanvasTexture(emblem());texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=2;
 const material=new T.MeshStandardMaterial({map:texture,roughness:.92,metalness:0,side:T.DoubleSide}),poleMat=new T.MeshStandardMaterial({color:'#6f7370',roughness:.45,metalness:.85});
 const standard=new T.Group(),garage=new T.Group(),cloth=new T.Mesh(new T.PlaneGeometry(.48,.72,8,12),material),large=new T.Mesh(new T.PlaneGeometry(.96,1.44,8,12),material);
 cloth.position.set(.27,.13,0);large.position.set(.51,2.5,0);standard.add(cloth);garage.add(large);
 const pole=new T.Mesh(new T.CylinderGeometry(.019,.022,1.25,10),poleMat);standard.add(pole);const tall=new T.Mesh(new T.CylinderGeometry(.025,.030,3.40,10),poleMat);tall.position.y=1.7;garage.add(tall);const foot=new T.Mesh(new T.CylinderGeometry(.24,.30,.08,16),poleMat);foot.position.y=.04;garage.add(foot);garage.position.set(-2.8,0,-1);
 const base=Float32Array.from(cloth.geometry.attributes.position.array),big=Float32Array.from(large.geometry.attributes.position.array);
 function drape(mesh:T.Mesh<T.PlaneGeometry>,original:Float32Array,t:number,small:boolean){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const edge=(original[i*3]+(small?.24:.48))/(small?.48:.96);p.setZ(i,Math.sin(edge*5+original[i*3+1]*4-t*1.3)*.035*edge+(1-edge)*.01)}p.needsUpdate=true;mesh.geometry.computeVertexNormals()}
 let current:ImageBitmap|null=null;
 return {standard,garage,attach(model:T.Group){const chest=model.getObjectByName('chest')!;standard.position.set(.62,.78,-.53);standard.rotation.set(0,0,0);chest.add(standard)},setCanvas(canvas:HTMLCanvasElement){texture.image=canvas;texture.needsUpdate=true},async load(blob:Blob|null){const next=blob?await decodeBanner(blob):null;current?.close();current=next;texture.image=next??emblem();texture.needsUpdate=true},pose(seconds:number,reduced:boolean){drape(cloth,base,reduced?0:seconds,true);drape(large,big,reduced?0:seconds,false)},visible(value:boolean){standard.visible=value;garage.visible=value},dispose(){standard.removeFromParent();garage.removeFromParent();for(const group of [standard,garage])group.traverse(o=>{if((o as T.Mesh).isMesh)(o as T.Mesh).geometry.dispose()});material.dispose();poleMat.dispose();texture.dispose();current?.close()}};
}

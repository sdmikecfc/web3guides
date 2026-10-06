// Extract complete sprite components; never redraw or generate anatomy in code.
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const out=path.resolve(__dirname,'../../public/bots-arcade/v1');fs.mkdirSync(out,{recursive:true});
const base='C:/Users/Mike/.codex/generated_images/01a07bed-dd01-7710-b234-8404a0056628';
const sources={
 'tank-jab':['exec-1998aeb6-2ead-47ca-9f15-f10567ac1525.png',4,2,414],
 'speed-jab':['exec-5f0c8251-a020-4413-a802-efff671a35fe.png',4,2,432],
 'tank-motion':['exec-46039c0c-2ba4-4db7-9c04-d92c85da7e89.png',4,2,407],
 'tank-walk':['exec-b2d23433-330e-4608-8514-b4f90b75734a.png',2,2,586],
 'speed-motion':['exec-f5d94280-2c92-4a37-810b-4b8db2d768b5.png',4,2,438],
 'tank-combat':['exec-8d0dbd3e-742e-4d39-a3b4-e7ab2263410d.png',4,2,340],
 'speed-combat':['exec-e2fbf6e4-2f1a-4f0e-9052-64f19a4f6135.png',4,2,379],
 'ranged-jab':['exec-8361c2a7-cf18-45b8-b2eb-0f01ec3e5982.png',4,2,414],
 'ranged-motion':['exec-ef04a3a9-4454-49f8-a289-739c23817697.png',4,2,414],
 'ranged-combat':['exec-22dcee9c-4521-425f-9072-e103069536c4.png',4,2,360],
 'ranged-special':['exec-7450f972-33c6-44a7-85d1-e4b8da27ffc0.png',4,2,407],
};
const extra=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/model-kombat-arcade-tier-art.json'),'utf8')).entries;
for(const e of extra)sources[e.key]=[e.source,e.columns,e.rows,0];
for(const [key,[file,cols,rows,referenceHeight]] of Object.entries(sources)){
 const png=PNG.sync.read(fs.readFileSync(path.join(base,file))),{width:w,height:h,data}=png;
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),parts=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<20)continue;
  let start=0,end=1,count=0,x0=w,y0=h,x1=0,y1=0;queue[0]=p;seen[p]=1;
  while(start<end){const a=queue[start++],x=a%w,y=Math.floor(a/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const b of [x? a-1:-1,x<w-1?a+1:-1,y?a-w:-1,y<h-1?a+w:-1])if(b>=0&&!seen[b]&&data[b*4+3]>=20){seen[b]=1;queue[end++]=b;}
  }
  if(count>8000)parts.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,count});
 }
 if(parts.length!==cols*rows)throw Error(`${key}: expected ${cols*rows} separate full characters, found ${parts.length}`);
 parts.sort((a,b)=>Math.floor((a.y+a.h/2)/(h/rows))-Math.floor((b.y+b.h/2)/(h/rows))||a.x-b.x);
 const frames=[];
 for(let i=0;i<parts.length;i++){
  const b=parts[i],dest=new PNG({width:b.w+8,height:b.h+8});
  PNG.bitblt(png,dest,b.x,b.y,b.w,b.h,4,4);
  const name=`${key}-${i}.png`;fs.writeFileSync(path.join(out,name),PNG.sync.write(dest));
  // A common body origin independent of how far the punching hand extends.
  const col=i%cols,originX=col*w/cols+w/cols*.50;
  frames.push({file:name,w:dest.width,h:dest.height,pivotX:originX-b.x+4,pivotY:b.h+4});
 }
 fs.copyFileSync(path.join(base,file),path.join(out,`${key}-sheet.png`));
 const ref=referenceHeight||Math.round(parts[0].h*(key.endsWith('-combat')?.81:1));
 fs.writeFileSync(path.join(out,`${key}.json`),JSON.stringify({version:1,source:file,referenceHeight:ref,frames},null,2));
 console.log(key,parts.map(b=>`${b.w}x${b.h}`).join(', '));
}
fs.copyFileSync(path.join(base,'exec-f1f5a428-4867-483d-ac98-bce3fb6e6ccf.png'),path.join(out,'reactor.png'));

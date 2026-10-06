/** Check actual PNG pixels and render static phone-size catalog previews. */
import assert from "node:assert/strict";
import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ITEMS,type ItemDef } from "../src/app/chef/game/_engine/items";
import { THEME_IDS,ITEM_SET_IDS,THEME_META } from "../src/app/chef/game/_view/art-manifest";
import { furniturePreview } from "../src/app/chef/game/_view/furniture-preview";

const sets=[...THEME_IDS,...ITEM_SET_IDS],root=process.cwd();
const kinds=Array.from(new Set(ITEMS.map(item=>item.art)));
const files=new Map<string,{width:number;height:number;left:number;top:number;right:number;bottom:number;png:Buffer}>();
function imageInfo(src:string){
  const found=files.get(src);if(found)return found;
  const png=readFileSync(join(root,"public",src)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  const pixels=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString("base64")}"/></svg>`).render().pixels;
  let left=width,top=height,right=0,bottom=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  assert.ok(right>left&&bottom>top,`${src} is empty`);
  const result={width,height,left,top,right,bottom,png};files.set(src,result);return result;
}
const measure=process.argv.includes("--measure");
for(const art of kinds){
  let left=Infinity,top=Infinity,right=0,bottom=0,width=0,height=0;
  for(const theme of sets){const item={...ITEMS.find(item=>item.art===art)!,collection:"essentials",artSet:undefined} as ItemDef;
    const info=imageInfo(furniturePreview(item,theme).src);({width,height}=info);left=Math.min(left,info.left);top=Math.min(top,info.top);right=Math.max(right,info.right);bottom=Math.max(bottom,info.bottom);
  }
  if(measure){const x=Math.max(0,left-8),y=Math.max(0,top-8);console.log(`${art}: ${JSON.stringify({width,height,alpha:[left,top,right,bottom],box:[x,y,Math.min(width,right+8)-x,Math.min(height,bottom+8)-y]})}`);}
}
if(measure)process.exit(0);
let checked=0;
for(const item of ITEMS)for(const theme of sets){
  const preview=furniturePreview(item,theme),info=imageInfo(preview.src),[x,y,w,h]=preview.viewBox.split(" ").map(Number);
  const expectedSet=item.artSet||(Object.prototype.hasOwnProperty.call(THEME_META,item.collection)?item.collection:theme);
  assert.equal(preview.src,item.artPath??`/chef-art/room/${expectedSet}/${item.art==="wallArt"?"wall-art":item.art}.png`);
  assert.equal(preview.width,info.width);assert.equal(preview.height,info.height);
  assert.ok(x<=info.left&&y<=info.top&&x+w>=info.right&&y+h>=info.bottom,`${item.id}/${theme} must retain every nonzero-alpha pixel, including shadows`);
  assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=info.width&&y+h<=info.height,`${item.id} viewport is within its transparent canvas`);
  const scale=Math.min(140/w,144/h),visibleWidth=(info.right-info.left)*scale,visibleHeight=(info.bottom-info.top)*scale;
  assert.ok(visibleWidth<=140+1e-6&&visibleHeight<=144+1e-6,`${item.id} must fit the phone preview`);
  assert.ok(Math.max(visibleWidth/140,visibleHeight/144)>=.75,`${item.id} must fill a useful portion of the phone preview`);
  checked++;
}

// Static render of the exact SVG/viewBox technique consumed by React. It
// preserves each full PNG; it is visual asset QA, not a browser screenshot.
const text=(x:number,y:number,label:string,size=11)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#655c49">${label}</text>`;
const width=144+kinds.length*150,height=100+sets.length*179;
let body=`<rect width="${width}" height="${height}" fill="#f6f0e2"/>`+text(20,28,"FURNITURE PREVIEW FRAMING · STATIC VISUAL QA",19)+text(20,49,"Actual shipped PNGs · each viewport 140 × 144 px · all seven collections · preserve every painted and shadow pixel",13);
kinds.forEach((art,column)=>body+=text(132+column*150,81,art));
sets.forEach((theme,row)=>{
  const yy=94+row*179;body+=text(16,yy+85,theme,12);
  kinds.forEach((art,column)=>{
    const item={...ITEMS.find(item=>item.art===art)!,collection:"essentials",artSet:undefined} as ItemDef;
    const preview=furniturePreview(item,theme),info=imageInfo(preview.src),xx=127+column*150;
    const[x,y,w,h]=preview.viewBox.split(" ").map(Number);
    assert.ok(x<=info.left&&y<=info.top&&x+w>=info.right&&y+h>=info.bottom,`${art}/${theme}: union framing excludes pixels`);
    body+=`<rect x="${xx}" y="${yy}" width="140" height="144" rx="11" fill="#fffcf3" stroke="#dfd7c4"/><svg x="${xx}" y="${yy}" width="140" height="144" viewBox="${preview.viewBox}" preserveAspectRatio="xMidYMid meet"><image width="${preview.width}" height="${preview.height}" href="data:image/png;base64,${info.png.toString("base64")}"/></svg>`;
  });
});
const out=join(root,".dk-preview");mkdirSync(out,{recursive:true});
writeFileSync(join(out,"furniture-shop-previews.png"),new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,{font:{loadSystemFonts:false,fontFiles:["C:/Windows/Fonts/arial.ttf"]}}).render().asPng());
console.log(`PASS ${checked} catalog/theme combinations, ${files.size} unique PNGs; all visible pixels fit 140×144 previews.`);
console.log("Static visual QA: .dk-preview/furniture-shop-previews.png");

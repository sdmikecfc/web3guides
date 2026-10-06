/** Actual-PNG recipe art framing, distinctness and native registration checks.
 * Also writes a static visual QA sheet; it is not a browser screenshot. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { DISHES } from "../src/app/chef/game/_engine/cookbook";
import { dishPresentation } from "../src/app/chef/game/_view/dish-presentation";

const images = new Map<string, { png: Buffer; pixels: Buffer; left: number; top: number; right: number; bottom: number }>();
const root = process.cwd();
function imageInfo(src: string) {
  const cached = images.get(src); if (cached) return cached;
  const png = readFileSync(join(root, "public", src));
  assert.equal(png.readUInt32BE(16), 256, `${src}: native width must preserve world registration`);
  assert.equal(png.readUInt32BE(20), 224, `${src}: native height must preserve world registration`);
  const pixels = Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="224"><image width="256" height="224" href="data:image/png;base64,${png.toString("base64")}"/></svg>`).render().pixels);
  let left = 256, top = 224, right = 0, bottom = 0;
  for (let y=0;y<224;y++) for(let x=0;x<256;x++) if(pixels[(y*256+x)*4+3]>0) {
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
  }
  assert.ok(right>left && bottom>top, `${src}: image is not empty`);
  const info={png,pixels,left,top,right,bottom}; images.set(src,info); return info;
}

const measure = process.argv.includes("--measure");
for(const dish of DISHES) {
  const regular = imageInfo(dishPresentation(dish.id).src);
  const mastered = imageInfo(dishPresentation(dish.id,true).src);
  if (measure) console.log(`${dish.id}: union alpha ${JSON.stringify([Math.min(regular.left,mastered.left),Math.min(regular.top,mastered.top),Math.max(regular.right,mastered.right),Math.max(regular.bottom,mastered.bottom)])}`);
  if (measure) continue;
  assert.equal(dishPresentation(dish.id).viewBox,dishPresentation(dish.id,true).viewBox, `${dish.id}: mastery keeps its framing`);
  let changed=0,painted=0;
  for(let i=0;i<regular.pixels.length;i+=4) {
    if(regular.pixels[i+3] || mastered.pixels[i+3]) painted++;
    if(!regular.pixels.subarray(i,i+4).equals(mastered.pixels.subarray(i,i+4))) changed++;
  }
  assert.ok(changed/painted>.13, `${dish.id}: mastery must visibly alter the painted dish`);
  for(const mastery of [false,true]) {
    const presentation=dishPresentation(dish.id,mastery),info=imageInfo(presentation.src);
    const svg=readFileSync(join(root,"public",presentation.svgSrc),"utf8");
    assert.deepEqual(Buffer.from(new Resvg(svg).render().pixels),info.pixels,`${presentation.src}: cookbook SVG and restaurant PNG share the exact authored illustration`);
    const[x,y,w,h]=presentation.viewBox.split(" ").map(Number);
    assert.ok(x<=info.left && y<=info.top && x+w>=info.right && y+h>=info.bottom, `${presentation.src}: frame must include every painted and shadow pixel`);
    assert.ok(x>=0 && y>=0 && x+w<=256 && y+h<=224,`${presentation.src}: frame fits the native canvas`);
    const scale=Math.min(180/w,144/h);
    assert.ok((info.right-info.left)*scale<=180.01 && (info.bottom-info.top)*scale<=144.01,`${presentation.src}: fits a phone cookbook preview`);
  }
}
if(measure) process.exit(0);
for(let i=0;i<DISHES.length;i++)for(let j=i+1;j<DISHES.length;j++)assert.notDeepEqual(imageInfo(dishPresentation(DISHES[i].id).src).png,imageInfo(dishPresentation(DISHES[j].id).src).png,"recipes need individual artwork");
assert.equal(dishPresentation("../../invalid").src,"/chef-art/dishes/margherita.png","unknown art IDs resolve to an authored plate");

const txt=(x:number,y:number,text:string,size=14,fill="#685b48")=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="${fill}">${text.replace(/&/g,"&amp;")}</text>`;
function art(id:string,mastered:boolean,x:number,y:number,w:number,h:number,vector=false) {
  const presentation=dishPresentation(id,mastered),info=imageInfo(presentation.src);
  if(vector){const svg=readFileSync(join(root,"public",presentation.svgSrc),"utf8");return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${presentation.viewBox}" preserveAspectRatio="xMidYMid meet">${svg.replace(/^<svg[^>]*>/,"").replace(/<\/svg>$/,"")}</svg>`;}
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${presentation.viewBox}" preserveAspectRatio="xMidYMid meet"><image width="256" height="224" href="data:image/png;base64,${info.png.toString("base64")}"/></svg>`;
}
const width=980,height=150+DISHES.length*121;
let body=`<rect width="${width}" height="${height}" fill="#f5efdf"/>`+txt(28,36,"DISH COLLECTION · STATIC VISUAL QA",22)+txt(28,60,"Exact shipped PNGs • 180 × 144 cookbook previews • native 34 px plates at right",13);
body+=txt(258,97,"HOUSE RECIPE",11)+txt(479,97,"MASTERED PRESENTATION",11)+txt(723,97,"IN-WORLD",11);
DISHES.forEach((dish,i)=>{
  const y=109+i*121;
  body+=`<rect x="22" y="${y}" width="936" height="114" rx="16" fill="#fffaf0"/>`+txt(38,y+44,dish.name,16)+txt(38,y+65,dish.domain||"Starter collection",11,"#91806a");
  body+=art(dish.id,false,248,y-15,180,144)+art(dish.id,true,489,y-15,180,144);
  const regular=imageInfo(dishPresentation(dish.id).src),master=imageInfo(dishPresentation(dish.id,true).src);
  body+=`<image x="745" y="${y+38}" width="34" height="29.75" href="data:image/png;base64,${regular.png.toString("base64")}"/><image x="817" y="${y+38}" width="34" height="29.75" href="data:image/png;base64,${master.png.toString("base64")}"/>`;
});
body+=txt(28,height-22,"Mastery changes plating and garnish. Featured art reuses an existing recipe; this sheet makes no offer or availability claim.",12);
const dir=join(root,".dk-preview");mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,"dish-collection-review.png"),new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,{font:{fontFiles:["C:/Windows/Fonts/arial.ttf"],loadSystemFonts:false}}).render().asPng());
const hero=`<rect width="600" height="450" fill="#faf2df"/><ellipse cx="302" cy="321" rx="217" ry="64" fill="#eee1c5"/>${art("tiramisu",true,68,53,464,297,true)}${txt(55,380,"Cloud Tiramisu",28)}${txt(55,411,"Mastered vector illustration · static feature-art review",14)}`;
writeFileSync(join(dir,"dish-feature-review.png"),new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450">${hero}</svg>`,{font:{fontFiles:["C:/Windows/Fonts/arial.ttf"],loadSystemFonts:false}}).render().asPng());
console.log(`PASS: ${DISHES.length} individual recipes, ${images.size} native PNGs, mastery changes and safe phone framing. Static sheets: .dk-preview/dish-collection-review.png and dish-feature-review.png.`);

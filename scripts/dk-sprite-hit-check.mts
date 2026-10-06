/** Real shipped-PNG picking regressions. No browser or Pixi renderer required. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { Sprite, Texture } from "pixi.js";
import { SPRITE_HIT_ALPHA, prepareSpriteHitMask, spriteContainsAlphaPoint, spriteContainsPoint, type SpriteAlphaMask, type SpriteHitGeometry } from "../src/app/chef/game/_view/sprite-hit-test";

const root=join(process.cwd(),"public/chef-art");
function pngMask(file:string):SpriteAlphaMask&{rgba:Uint8Array} {
  const png=readFileSync(join(root,file)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  const image=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString("base64")}"/></svg>`).render();
  const rgba=image.pixels,alpha=Uint8Array.from({length:width*height},(_,i)=>rgba[i*4+3]);
  return {width,height,alpha,rgba};
}
function sprite(mask:SpriteAlphaMask,x=0,y=32,sx=.5,sy=.5):SpriteHitGeometry {
  return {position:{x,y},scale:{x:sx,y:sy},anchor:{x:.5,y:208/224},texture:{orig:{width:mask.width,height:mask.height},uvs:{x0:0,y0:0,x1:1,y1:0,x3:0,y3:1}}};
}
function pixelPoint(s:SpriteHitGeometry,x:number,y:number):{x:number;y:number} {
  return {x:s.position.x+(x+.5-s.anchor.x*s.texture.orig.width)*s.scale.x,y:s.position.y+(y+.5-s.anchor.y*s.texture.orig.height)*s.scale.y};
}
function rawAlphaAt(mask:SpriteAlphaMask,s:SpriteHitGeometry,p:{x:number;y:number}):number {
  const x=Math.floor((p.x-s.position.x)/s.scale.x+s.anchor.x*s.texture.orig.width);
  const y=Math.floor((p.y-s.position.y)/s.scale.y+s.anchor.y*s.texture.orig.height);
  return x>=0&&y>=0&&x<mask.width&&y<mask.height?mask.alpha[y*mask.width+x]:-1;
}
function findPixel(mask:SpriteAlphaMask,accept:(alpha:number,x:number,y:number)=>boolean):{x:number;y:number} {
  for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(accept(mask.alpha[y*mask.width+x],x,y))return {x,y};
  throw new Error("Real art fixture lacks the requested pixel");
}

const themes=["trattoria","izakaya","taqueria","diner","bistro","neonlab","bonebronze"];
let regressions=0;
for(const theme of themes){
  const table=pngMask(`room/${theme}/table.png`),tableSprite=sprite(table);
  for(const rear of[false,true])for(const mirrored of[false,true]){
    const chair=pngMask(`room/${theme}/chair${rear?"-back":""}.png`),chairSprite=sprite(chair,32,16,mirrored?-.5:.5);
    const pixel=findPixel(chair,(alpha,x,y)=>alpha>=200&&rawAlphaAt(table,tableSprite,pixelPoint(chairSprite,x,y))===0);
    const point=pixelPoint(chairSprite,pixel.x,pixel.y);
    assert.equal(rawAlphaAt(table,tableSprite,point),0,"old table rectangle covers this exact transparent pixel");
    assert.equal(spriteContainsAlphaPoint(tableSprite,table,point.x,point.y),false,`${theme}: transparent table must not intercept chair`);
    assert.equal(spriteContainsAlphaPoint(chairSprite,chair,point.x,point.y),true,`${theme}: visible chair remains selectable`);
    const frontToBack=[{id:"table",s:tableSprite,mask:table},{id:"chair",s:chairSprite,mask:chair}];
    assert.equal(frontToBack.find(entry=>spriteContainsAlphaPoint(entry.s,entry.mask,point.x,point.y))?.id,"chair");
    if(regressions===0)console.log(`Chair behind transparent table regression point: (${point.x}, ${point.y}) in room coordinates`);
    // Parent camera zoom/pan is removed before this API; identical room points
    // must keep selecting the same sprite at every supported camera scale.
    for(const zoom of[.65,1,1.8,2.5]){
      const screen={x:point.x*zoom+317,y:point.y*zoom+241};
      assert.equal(spriteContainsAlphaPoint(chairSprite,chair,(screen.x-317)/zoom,(screen.y-241)/zoom),true);
    }
    regressions++;
  }
  const opaque=findPixel(table,a=>a===255),p=pixelPoint(tableSprite,opaque.x,opaque.y);
  assert.equal(spriteContainsAlphaPoint(tableSprite,table,p.x,p.y),true,"table's actual painted pixels still select it");
  const shadow=findPixel(table,a=>a>0&&a<SPRITE_HIT_ALPHA),sp=pixelPoint(tableSprite,shadow.x,shadow.y);
  assert.equal(spriteContainsAlphaPoint(tableSprite,table,sp.x,sp.y),false,"faint shadows do not steal selection");
}
console.log(`PASS ${regressions} real chair/table occlusion fixtures across 7 collections, mirrored/rear views, and camera scales`);

const atlas=pngMask("chars/guest0.png");
const sheet=JSON.parse(readFileSync(join(root,"chars/guest0.json"),"utf8"));
let atlasChecks=0;
for(const [name,entry] of Object.entries(sheet.frames) as [string,any][]){
  const f=entry.frame,orig=entry.sourceSize,trim=entry.trimmed?entry.spriteSourceSize:null;
  assert.equal(entry.rotated,false,"the shipped cast atlas currently uses unrotated frames");
  const s:SpriteHitGeometry={position:{x:91,y:85},scale:{x:.5,y:.5},anchor:{x:.5,y:116/128},texture:{orig:{width:orig.w,height:orig.h},trim:trim?{x:trim.x,y:trim.y,width:trim.w,height:trim.h}:null,uvs:{x0:f.x/atlas.width,y0:f.y/atlas.height,x1:(f.x+f.w)/atlas.width,y1:f.y/atlas.height,x3:f.x/atlas.width,y3:(f.y+f.h)/atlas.height}}};
  for(const wantSolid of[false,true]){
    let found=false;
    for(let y=0;y<f.h&&!found;y++)for(let x=0;x<f.w&&!found;x++){
      const alpha=atlas.alpha[(f.y+y)*atlas.width+f.x+x];
      if(wantSolid?alpha<200:alpha!==0)continue;
      const p=pixelPoint(s,x+(trim?.x??0),y+(trim?.y??0));
      assert.equal(spriteContainsAlphaPoint(s,atlas,p.x,p.y),wantSolid,`${name}: sample selected frame, not full atlas`);
      const mirrored={...s,scale:{x:-.5,y:.5}},mp=pixelPoint(mirrored,x+(trim?.x??0),y+(trim?.y??0));
      assert.equal(spriteContainsAlphaPoint(mirrored,atlas,mp.x,mp.y),wantSolid,`${name}: mirrored atlas frame`);
      found=true;
    }
    assert.ok(found,`${name} must contain a ${wantSolid?"painted":"transparent"} test pixel`);
  }
  atlasChecks++;
}
console.log(`PASS ${atlasChecks} real character atlas frames, including mirrored transparent/opaque samples`);

// Use real chair alpha with synthetic atlas metadata to exercise trim and UV
// rotation. Texture UVs are normalized, independent of source resolution.
const chair=pngMask("room/trattoria/chair.png"),solid=findPixel(chair,a=>a===255);
const trimmed=sprite(chair);trimmed.anchor={x:.25,y:.75};trimmed.scale={x:-1.25,y:.8};
trimmed.texture={...trimmed.texture,orig:{width:240,height:280},trim:{x:23,y:31,width:chair.width,height:chair.height}};
const tp=pixelPoint(trimmed,solid.x+23,solid.y+31);
assert.equal(spriteContainsAlphaPoint(trimmed,chair,tp.x,tp.y),true);
const outsideTrim=pixelPoint(trimmed,0,0);assert.equal(spriteContainsAlphaPoint(trimmed,chair,outsideTrim.x,outsideTrim.y),false);
const rotated=sprite(chair);rotated.texture={orig:{width:chair.height,height:chair.width},uvs:{x0:1,y0:0,x1:1,y1:1,x3:0,y3:0}};
const rp=pixelPoint(rotated,solid.y,chair.width-1-solid.x);
assert.equal(spriteContainsAlphaPoint(rotated,chair,rp.x,rp.y),true,"clockwise packed frame follows UV orientation");
const resolutionTwo=sprite(chair);resolutionTwo.texture={...resolutionTwo.texture,orig:{width:chair.width/2,height:chair.height/2}};
const highDpiPoint={x:resolutionTwo.position.x+((solid.x+.5)/2-resolutionTwo.anchor.x*chair.width/2)*resolutionTwo.scale.x,y:resolutionTwo.position.y+((solid.y+.5)/2-resolutionTwo.anchor.y*chair.height/2)*resolutionTwo.scale.y};
assert.equal(spriteContainsAlphaPoint(resolutionTwo,chair,highDpiPoint.x,highDpiPoint.y),true,"resolution-two geometry samples physical PNG pixels through normalized UVs");
for(const bad of[NaN,Infinity,-Infinity])assert.equal(spriteContainsAlphaPoint(trimmed,chair,bad,0),false);
assert.equal(spriteContainsAlphaPoint({...trimmed,scale:{x:0,y:1}},chair,tp.x,tp.y),false);
assert.equal(spriteContainsAlphaPoint(trimmed,{width:192,height:224,alpha:new Uint8Array(1)},tp.x,tp.y),false);
console.log("PASS trim/orig anchors, nonuniform/reversed scales, UV rotation, source resolution, and invalid geometry fail closed");

// Exercise caching with real PNG RGBA through a small canvas test double. It
// verifies source/frame cache sharing and unreadable-resource behavior, not DOM.
const prior=Object.getOwnPropertyDescriptor(globalThis,"OffscreenCanvas");
let reads=0,draws=0,throwRead=false;
Object.defineProperty(globalThis,"OffscreenCanvas",{configurable:true,value:class {
  getContext(){return {drawImage(){draws++;},getImageData(){reads++;if(throwRead)throw new Error("unreadable image");return {data:chair.rgba};}};}
}});
try{
  const resource={width:chair.width,height:chair.height};
  const texture={...sprite(chair).texture,source:{resource},destroyed:false} as unknown as Texture;
  assert.equal(prepareSpriteHitMask(texture),true);
  const testSprite={...sprite(chair),texture} as Pick<Sprite,"texture"|"anchor"|"scale"|"position">;
  const p=pixelPoint(sprite(chair),solid.x,solid.y);
  for(let i=0;i<12;i++)assert.equal(spriteContainsPoint(testSprite,p.x,p.y),true);
  assert.equal(prepareSpriteHitMask({...texture} as Texture),true,"frame/texture wrappers share one source mask");
  assert.equal(reads,1);assert.equal(draws,1);
  throwRead=true;
  const unreadable={...texture,source:{resource:{width:192,height:224}}} as Texture;
  assert.equal(prepareSpriteHitMask(unreadable),false);
  assert.equal(spriteContainsPoint({...testSprite,texture:unreadable},p.x,p.y),false);
  assert.equal(reads,2,"unreadable resources fail closed and do not retry every click");
}finally{
  if(prior)Object.defineProperty(globalThis,"OffscreenCanvas",prior);else delete (globalThis as any).OffscreenCanvas;
}
console.log("PASS one CPU alpha read per shared image; clicks use cache; unreadable images never fall back to rectangles");

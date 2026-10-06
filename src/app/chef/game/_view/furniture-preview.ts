import type { ItemDef } from "../_engine/items";
import { THEME_META } from "./art-manifest";

export interface FurniturePreview { src:string; width:number; height:number; viewBox:string }
interface PreviewFrame { width:number; height:number; box:readonly[number,number,number,number] }

// Native image dimensions remain unchanged. Shop SVG viewports remove only
// outer transparent canvas; every painted/shadow pixel stays inside the box.
// Checked against all seven collections by dk-furniture-preview-check.mts.
const FRAMES:Record<ItemDef["art"],PreviewFrame>={
  table:{width:192,height:224,box:[31,59,130,150]},
  chair:{width:192,height:224,box:[41,37,110,170]},
  counter:{width:320,height:240,box:[82,43,188,174]},
  stove:{width:192,height:224,box:[33,53,126,158]},
  plant:{width:192,height:224,box:[39,37,116,172]},
  rug:{width:256,height:128,box:[0,0,256,128]},
  doormat:{width:128,height:64,box:[0,0,128,64]},
  bench:{width:192,height:224,box:[29,40,134,172]},
  toilet:{width:192,height:224,box:[44,46,102,157]},
  partition:{width:192,height:224,box:[47,34,96,171]},
  wallArt:{width:192,height:224,box:[61,48,70,112]},
};

/** Render with <svg viewBox={...}><image href={src} width={width} height={height}/></svg>. */
export function furniturePreview(item:ItemDef,theme:string):FurniturePreview {
  if(item.artPath)return {src:item.artPath,width:192,height:224,viewBox:item.machine==="fryer"?"24 64 144 148":"24 26 144 186"};
  const set=item.artSet||(Object.prototype.hasOwnProperty.call(THEME_META,item.collection)?item.collection:theme);
  const frame=FRAMES[item.art];
  return {src:`/chef-art/room/${set}/${item.art==="wallArt"?"wall-art":item.art}.png`,width:frame.width,height:frame.height,viewBox:frame.box.join(" ")};
}

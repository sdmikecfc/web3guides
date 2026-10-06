import type { Sprite, Texture } from "pixi.js";

/** Baked contact shadows peak below 64 alpha, so they do not steal taps. */
export const SPRITE_HIT_ALPHA = 64;
export interface SpriteAlphaMask { width:number; height:number; alpha:Uint8Array }
interface Point { x:number; y:number }
interface Rect { x:number; y:number; width:number; height:number }
export interface SpriteHitGeometry {
  position:Point; scale:Point; anchor:Point;
  texture:{
    orig:{width:number;height:number}; trim?:Rect|null;
    /** Pixi's normalized UV corners already include atlas rotation/resolution. */
    uvs:{x0:number;y0:number;x1:number;y1:number;x3:number;y3:number};
  };
}

/**
 * Pure coordinate/alpha test. Coordinates are in the sprite parent's space;
 * callers undo the restaurant camera transform before calling this function.
 * The game sprites have no individual skew/rotation; their scale may mirror.
 */
export function spriteContainsAlphaPoint(sprite:SpriteHitGeometry,mask:SpriteAlphaMask,lx:number,ly:number):boolean {
  const {position,scale,anchor,texture}=sprite;
  const {orig,trim,uvs}=texture;
  if(!uvs||!orig||!Number.isFinite(lx)||!Number.isFinite(ly)||
    !Number.isFinite(scale.x)||!Number.isFinite(scale.y)||scale.x===0||scale.y===0||
    !Number.isInteger(mask.width)||!Number.isInteger(mask.height)||mask.width<=0||mask.height<=0||
    mask.alpha.length<mask.width*mask.height)return false;
  const x=(lx-position.x)/scale.x+anchor.x*orig.width-(trim?.x??0);
  const y=(ly-position.y)/scale.y+anchor.y*orig.height-(trim?.y??0);
  const width=trim?.width??orig.width,height=trim?.height??orig.height;
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(width)||!Number.isFinite(height)||
    width<=0||height<=0||x<0||y<0||x>=width||y>=height)return false;
  const u=x/width,v=y/height;
  const tx=uvs.x0+u*(uvs.x1-uvs.x0)+v*(uvs.x3-uvs.x0);
  const ty=uvs.y0+u*(uvs.y1-uvs.y0)+v*(uvs.y3-uvs.y0);
  if(!Number.isFinite(tx)||!Number.isFinite(ty))return false;
  // Clamp to this frame's final texel at a reversed UV edge. Otherwise an
  // atlas rotation can sample its neighbor at the frame's exclusive boundary.
  const x2=uvs.x1+uvs.x3-uvs.x0,y2=uvs.y1+uvs.y3-uvs.y0;
  const minX=Math.floor(Math.min(uvs.x0,uvs.x1,uvs.x3,x2)*mask.width+1e-7);
  const minY=Math.floor(Math.min(uvs.y0,uvs.y1,uvs.y3,y2)*mask.height+1e-7);
  const maxX=Math.ceil(Math.max(uvs.x0,uvs.x1,uvs.x3,x2)*mask.width-1e-7)-1;
  const maxY=Math.ceil(Math.max(uvs.y0,uvs.y1,uvs.y3,y2)*mask.height-1e-7)-1;
  if(minX<0||minY<0||maxX>=mask.width||maxY>=mask.height||maxX<minX||maxY<minY)return false;
  const px=Math.max(minX,Math.min(maxX,Math.floor(tx*mask.width)));
  const py=Math.max(minY,Math.min(maxY,Math.floor(ty*mask.height)));
  return mask.alpha[py*mask.width+px]>=SPRITE_HIT_ALPHA;
}

type HitSprite=Pick<Sprite,"texture"|"anchor"|"scale"|"position">;
interface CachedMask { width:number; height:number; mask:SpriteAlphaMask|null }
// Atlas frames and different TextureSource wrappers can share the same image.
// Weak keys release masks when the asset resource itself is no longer used.
const masks=new WeakMap<object,CachedMask>();

function maskFor(texture:Texture):SpriteAlphaMask|null {
  if(texture.destroyed||!texture.source)return null;
  const resource=texture.source.resource as object|undefined;
  if(!resource||typeof resource!=="object")return null;
  const image=resource as {naturalWidth?:number;naturalHeight?:number;width?:number;height?:number};
  const width=image.naturalWidth??image.width??0,height=image.naturalHeight??image.height??0;
  // Do not cache a not-yet-decoded image; it can be prepared after loading.
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)return null;
  const cached=masks.get(resource);
  if(cached&&cached.width===width&&cached.height===height)return cached.mask;
  let mask:SpriteAlphaMask|null=null;
  try {
    let context:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null=null;
    if(typeof OffscreenCanvas!=="undefined"){
      try { context=new OffscreenCanvas(width,height).getContext("2d",{willReadFrequently:true}); } catch { /* Try the DOM canvas below. */ }
    }
    if(!context&&typeof document!=="undefined"){
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      context=canvas.getContext("2d",{willReadFrequently:true});
    }
    if(context){
      context.drawImage(resource as CanvasImageSource,0,0,width,height);
      const rgba=context.getImageData(0,0,width,height).data;
      const alpha=new Uint8Array(width*height);
      for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
      mask={width,height,alpha};
    }
  } catch {
    // A tainted, destroyed, unsupported or unreadable source is not clickable.
    // A broad rectangular fallback would reintroduce the original wrong-pick bug.
  }
  masks.set(resource,{width,height,mask});
  return mask;
}

/** Warm static image/atlas masks after loading. One CPU read per source image. */
export function prepareSpriteHitMask(texture:Texture):boolean { return maskFor(texture)!==null; }

/** No GPU extraction. After preparation a hit only samples cached alpha bytes. */
export function spriteContainsPoint(sprite:HitSprite,lx:number,ly:number):boolean {
  const mask=maskFor(sprite.texture);
  return !!mask&&spriteContainsAlphaPoint(sprite,mask,lx,ly);
}

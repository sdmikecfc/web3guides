import type {Fighter} from './types';
import {moveFor} from './moves';
import {crouching,guarding} from './engine';
import {fighterArtKey} from './art';
export type FrameSelection={sheet:string;frame:number};
/** Select whole-character drawings. There are deliberately no limb transforms. */
export function animationFrame(f:Fighter):FrameSelection{
 const style=fighterArtKey(f.build);
 if(f.down||f.hp<=0)return{sheet:`${style}-motion`,frame:7};
 if(f.stun||f.throwBy!==null)return{sheet:`${style}-motion`,frame:6};
 if(f.blockstun||guarding(f))return{sheet:`${style}-motion`,frame:f.held.down?5:4};
 if(f.move){
  const m=moveFor(f.move,f.build),wind=f.frame<m.startup,active=f.frame<m.startup+m.active;
  if(f.build.style==='ranged'&&['special','advance','ground','super'].includes(f.move)){
   const frame=f.move==='ground'?(wind?4:5):f.move==='super'?(wind?6:7):wind?(f.frame<m.startup*.45?0:1):active?2:3;
   return{sheet:`${style}-special`,frame};
  }
  if(['special','advance','ground','super'].includes(f.move)){
   const first=f.move==='special'?0:f.move==='advance'?2:f.move==='ground'?4:6;
   return{sheet:`${style}-special`,frame:first+(wind?0:1)};
  }
  if(['jab','cross','step','airLight'].includes(f.move)){
   const frame=wind?Math.min(3,Math.floor(f.frame/m.startup*4)):active?4:Math.min(7,5+Math.floor((f.frame-m.startup-m.active)/m.recovery*3));
   return{sheet:`${style}-jab`,frame};
  }
  if(f.move==='low'||f.move==='ground')return{sheet:wind?`${style}-motion`:`${style}-combat`,frame:wind?5:4};
  if(f.move==='launcher')return{sheet:wind?`${style}-motion`:`${style}-combat`,frame:wind?5:5};
  if(f.move==='airHeavy')return{sheet:`${style}-combat`,frame:wind?6:7};
  return{sheet:`${style}-combat`,frame:wind?(f.frame<m.startup*.5?0:1):active?2:3};
 }
 if(f.y)return{sheet:`${style}-combat`,frame:6};
 if(crouching(f))return{sheet:`${style}-motion`,frame:5};
 if(Math.abs(f.vx)>1)return{sheet:`${style}-${style==='tank'?'walk':'motion'}`,frame:Math.floor(f.walk/36)%4};
 return{sheet:`${style}-jab`,frame:0};
}

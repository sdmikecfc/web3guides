import * as THREE from 'three';
import type {DecorDiscovery} from '../../../lib/chef/diner/decor-discoveries';
import {disposeObject,material} from './models';
/** Entirely cosmetic. No targets, navigation or simulation RNG are involved. */
export function createDiscoveryEffects(parent:THREE.Group){
 const root=new THREE.Group();root.name='decorating-discoveries';root.userData.inputPassthrough=true;parent.add(root);
 let active:DecorDiscovery|null=null,started=0,next=0,cursor=0,previewKey='',moved:THREE.Group|null=null,baseY=0;
 function clear(){if(moved){moved.rotation.x=0;moved.position.y=baseY;moved=null;}for(const child of [...root.children]){disposeObject(child);root.remove(child);}}
 function start(d:DecorDiscovery,time:number){clear();active=d;started=time;root.position.set(d.x,d.height+.12,d.y);
  if(d.id==='window_garden'){for(const side of [-1,1]){const wing=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),material(side<0?'#e8b86d':'#eaa57c'));wing.scale.set(1,.14,.55);wing.position.x=side*.06;wing.userData.side=side;root.add(wing);}}
  if(d.id==='coffee_pie'){for(let i=0;i<3;i++){const curl=new THREE.Mesh(new THREE.TorusGeometry(.065,.008,4,12,Math.PI*1.5),material('#efe1c8'));curl.position.set((i-1)*.07,.20+i*.12,0);root.add(curl);}}
 }
 return {update(time:number,discoveries:DecorDiscovery[],preview:boolean,reduced:boolean,model:(id:string)=>THREE.Group|undefined){
  const key=discoveries.map(d=>`${d.id}:${d.x}:${d.y}`).join('|');
  if(active&&!discoveries.some(d=>d.id===active!.id&&d.x===active!.x&&d.y===active!.y)){clear();active=null;}
  if(preview&&key!==previewKey){previewKey=key;if(discoveries.length)start(discoveries[0],time);}
  if(!preview)previewKey='';
  if(!active&&discoveries.length&&(time>=next||reduced)){start(discoveries[cursor++%discoveries.length],time);next=time+60;}
  if(!active)return;const t=reduced?1:time-started;
  if(!reduced&&t>5){clear();active=null;next=Math.max(next,time+55);return;}
  if(active.id==='window_garden'){root.position.y=active.height+.1+(reduced?0:Math.sin(t*2)*.08);root.position.z=active.y+(reduced?0:Math.sin(t)*.27);for(const wing of root.children)wing.rotation.z=wing.userData.side*(reduced?.45:Math.sin(t*14)*.6);}
  if(active.id==='coffee_pie')root.children.forEach((c,i)=>{c.position.y=.2+((t*.10+i*.12)%.48);c.rotation.y=t*.2;});
  if(active.id==='welcome_bear'||active.id==='radio_mascot'){const id=active.objects[active.id==='welcome_bear'?0:1],target=model(id);if(target){if(moved!==target){moved=target;baseY=target.position.y;}target.rotation.x=active.id==='welcome_bear'?(reduced?.055:Math.sin(Math.min(1,t/3)*Math.PI)*.11):(reduced?.03:Math.sin(t*4)*.045);}}
 },dispose(){clear();parent.remove(root);}};
}

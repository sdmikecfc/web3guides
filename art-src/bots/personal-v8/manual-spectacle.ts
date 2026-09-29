import * as T from 'three';
import type {ManualPractice9} from './manual-engine';
import type {Side} from './v8-engine';

// Bounded, event-driven presentation. Never changes time, damage or collision.
export function manualSpectacle(scene:T.Scene,showLane=true){
 const geometry=new T.RingGeometry(.74,1,32),rayGeometry=new T.PlaneGeometry(.07,1),materials:T.MeshBasicMaterial[]=[];
 const material=(color:string)=>{const m=new T.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide});materials.push(m);return m;};
 const bursts=Array.from({length:12},()=>{const group=new T.Group(),m=material('#ffe7a4'),ring=new T.Mesh(geometry,m);group.add(ring);for(let i=0;i<8;i++){const ray=new T.Mesh(rayGeometry,m);const r=i*Math.PI/4;ray.position.set(Math.sin(r)*1.2,Math.cos(r)*1.2,0);ray.rotation.z=-r;group.add(ray);}group.visible=false;scene.add(group);return{group,m,tick:-100,duration:16};});
 const halos=([0,1] as Side[]).map(()=>{const group=new T.Group(),m=material('#64eeff');for(let i=0;i<3;i++){const ring=new T.Mesh(geometry,m);ring.scale.setScalar(1.7+i*.2);ring.position.y=.6+i*1.3;ring.rotation.x=Math.PI/2;group.add(ring);}scene.add(group);return{group,m};});
 const paths=([0,1] as Side[]).map(()=>{const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(new Float32Array(24*3),3)),m=new T.LineBasicMaterial({color:'#63f5ff',transparent:true,opacity:.8,depthWrite:false}),line=new T.Line(g,m);scene.add(line);return{line,g,m,points:[] as T.Vector3[]};});
 const lane=new T.Group(),laneGeometry=new T.BoxGeometry(16.4,.035,3.5),postGeometry=new T.BoxGeometry(.16,3.8,.16),railGeometry=new T.BoxGeometry(.12,.06,3.5),laneMat=material('#18272b'),edgeMat=material('#edbb67');laneMat.opacity=.7;edgeMat.opacity=.95;const floor=new T.Mesh(laneGeometry,laneMat);floor.position.y=.035;lane.add(floor);for(const side of [-1,1]){for(const z of [-1.75,1.75]){const post=new T.Mesh(postGeometry,edgeMat);post.position.set(side*8.2,1.9,z);lane.add(post);}const rail=new T.Mesh(railGeometry,edgeMat);rail.position.set(side*6.8,.065,0);lane.add(rail);}lane.visible=showLane;scene.add(lane);
 let last=-1,cursor=0,seen=0,current:ManualPractice9|null=null;
 function pose(e:ManualPractice9,reduced:boolean){if(current!==e||e.tick<last){current=e;seen=0;last=-1;for(const p of paths)p.points=[];for(const b of bursts)b.tick=-100;}
  for(;seen<e.events.length;seen++){const event=e.events[seen];if(reduced||!event.point||!(['hit','parry','break','special'].includes(event.kind)||event.reason==='landing'))continue;const burst=bursts[cursor++%bursts.length];burst.tick=event.tick;burst.duration=event.kind==='break'?22:16;burst.group.position.fromArray(event.point);burst.group.position.z+=.6;burst.m.color.set(event.kind==='parry'?'#70eaff':event.kind==='break'?'#ff9871':event.reason==='landing'?'#d7c59d':'#ffe7a4');}
  for(const b of bursts){const t=(e.tick-b.tick)/b.duration;b.group.visible=t>=0&&t<1&&!reduced;b.group.scale.setScalar(.15+Math.max(0,t)*.85);b.m.opacity=Math.max(0,1-t)*.8;}
  for(const who of [0,1] as Side[]){const a=e.actors[who],active=a.specialUntil>e.tick&&!e.done,style=a.build.style,h=halos[who],p=paths[who],target=style==='ranged'?e.actors[(1-who) as Side]:a;
   h.group.visible=active;h.group.position.copy(target.root.position);h.m.color.set(style==='tank'?'#ffc65b':style==='speed'?'#54eaff':'#bc7dff');h.m.opacity=active?(reduced?.35:.35+.16*Math.sin(e.tick*.15)):0;h.group.scale.setScalar(style==='tank'?1.15:style==='speed'?.8:1.05);
   h.group.children.forEach((ring,i)=>{ring.rotation.z=reduced?0:e.tick*.035*(i%2?1:-1);ring.position.y=.6+i*1.3+(reduced?0:Math.sin(e.tick*.1+i)*.12);});
   if(e.tick!==last){if(!reduced&&(active&&style==='speed'||e.jumpHeight(who)>0||a.dodgeUntil>e.tick)){p.points.push(a.root.position.clone().add(new T.Vector3(0,1.3,.15)));if(p.points.length>24)p.points.shift();}else p.points=[];}
   const attr=p.g.attributes.position;for(let i=0;i<24;i++){const v=p.points[i]??a.root.position;attr.setXYZ(i,v.x,v.y,v.z);}attr.needsUpdate=true;p.g.setDrawRange(0,p.points.length);p.line.visible=p.points.length>1&&!reduced;p.line.frustumCulled=false;
  }last=e.tick;
 }
 return{pose,dispose(){lane.removeFromParent();laneGeometry.dispose();postGeometry.dispose();railGeometry.dispose();for(const b of bursts)b.group.removeFromParent();for(const h of halos)h.group.removeFromParent();for(const p of paths){p.line.removeFromParent();p.g.dispose();p.m.dispose();}geometry.dispose();rayGeometry.dispose();materials.forEach(m=>m.dispose());}};
}

import * as T from 'three';
import type {Practice8,Event8,Side} from './v8-engine';
import {KITS} from './weapon-actions';
type Mood='pride'|'anger'|'fear';
const COLORS={pride:'#ffe294',anger:'#ff775f',fear:'#80dff5'};
/** Small original comic marks, not random faces. All cues derive from recorded events. */
export function fightPersonality(scene:T.Scene){
 const textures=new Map<string,T.CanvasTexture>();
 function icon(kind:Mood|'impact'){
  if(textures.has(kind))return textures.get(kind)!;
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d')!;
  x.lineCap='round';x.lineJoin='round';x.shadowColor='#09151e';x.shadowBlur=4;x.strokeStyle='#15212a';x.lineWidth=7;
  if(kind==='impact'){x.fillStyle='#fff5cf';x.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?16:52;x.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r)}x.closePath();x.stroke();x.fill();}
  if(kind==='pride'){x.fillStyle=COLORS.pride;for(const [cx,cy,r] of [[60,59,36],[99,28,16],[25,99,12]]){x.beginPath();x.moveTo(cx,cy-r);x.lineTo(cx+8,cy-8);x.lineTo(cx+r,cy);x.lineTo(cx+8,cy+8);x.lineTo(cx,cy+r);x.lineTo(cx-8,cy+8);x.lineTo(cx-r,cy);x.lineTo(cx-8,cy-8);x.closePath();x.stroke();x.fill();}}
  if(kind==='anger'){for(const color of ['#15212a',COLORS.anger]){x.strokeStyle=color;x.lineWidth=color===COLORS.anger?8:15;for(let i=0;i<4;i++){x.save();x.translate(64,64);x.rotate(i*Math.PI/2);x.beginPath();x.moveTo(-30,-44);x.lineTo(-23,-23);x.lineTo(-44,-30);x.stroke();x.restore();}}}
  if(kind==='fear'){x.fillStyle=COLORS.fear;x.beginPath();x.moveTo(51,19);x.bezierCurveTo(31,50,21,68,25,83);x.bezierCurveTo(32,115,75,108,75,80);x.bezierCurveTo(75,58,60,34,51,19);x.closePath();x.stroke();x.fill();x.fillStyle='#e5fdff';x.beginPath();x.ellipse(43,77,6,12,.3,0,Math.PI*2);x.fill();x.strokeStyle=COLORS.fear;x.lineWidth=7;for(let i=0;i<3;i++){x.beginPath();x.moveTo(91+i*10,28);x.lineTo(87+i*10,54-i*5);x.stroke();}}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;textures.set(kind,texture);return texture;
 }
 const moods=([0,1] as Side[]).map(()=>{const material=new T.SpriteMaterial({map:icon('pride'),transparent:true,depthWrite:false});const sprite=new T.Sprite(material);sprite.visible=false;sprite.scale.setScalar(.72);scene.add(sprite);return {sprite,material,kind:'pride' as Mood,until:-1,next:0};});
 const paths=([0,1] as Side[]).map(()=>{const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(18*3),3));const material=new T.LineBasicMaterial({color:'#ffdcaa',transparent:true,opacity:.42,depthWrite:false});const line=new T.Line(geometry,material);line.frustumCulled=false;line.visible=false;scene.add(line);return {line,geometry,material,points:[] as T.Vector3[],last:-1,action:-1};});
 function track(engine:Practice8){for(const who of [0,1] as Side[]){const a=engine.actors[who],p=paths[who],action=a.action;
  if(action&&action.def.path!=='punch'&&!KITS[a.build.weapon].projectile&&action.elapsed>=action.prepare&&action.elapsed<action.prepare+action.active&&a.downUntil<=engine.tick){if(p.action!==action.id){p.points=[];p.action=action.id}let mount=action.mount;if(action.def.path==='combo'&&action.elapsed>action.prepare+action.active*.5)mount='L';const tip=engine.weaponPoints(a,mount)[0];if(tip){p.points.push(tip.clone());if(p.points.length>18)p.points.shift();p.last=engine.tick;}}
  if(engine.tick-p.last>8)p.points=[];
 }}
 const bursts:{sprite:T.Sprite;start:number;end:number;strength:number}[]=[];
 let health:Practice8['actors'][number]['hp'][]|null=null;
 let audio:AudioContext|null=null,muted=true,lastSound=-100;
 function enableSound(on:boolean){muted=!on;if(on){audio??=new AudioContext();void audio.resume();}else if(audio)void audio.suspend();}
 function sound(event:Event8){if(muted||!audio||audio.state!=='running'||event.tick-lastSound<5)return;lastSound=event.tick;
  const at=audio.currentTime,heavy=/hammer|axe/.test(event.action??''),block=event.kind==='block'||event.kind==='parry',osc=audio.createOscillator(),gain=audio.createGain();
  osc.type=block?'triangle':'sine';osc.frequency.setValueAtTime(block?620:heavy?100:175,at);osc.frequency.exponentialRampToValueAtTime(block?240:42,at+.13);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.14,at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+.20);osc.connect(gain).connect(audio.destination);osc.start(at);osc.stop(at+.21);osc.onended=()=>{osc.disconnect();gain.disconnect()};
  const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.09),audio.sampleRate),data=buffer.getChannelData(0);let state=event.id+1;for(let i=0;i<data.length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;data[i]=(state/4294967296*2-1)*(1-i/data.length)}const noise=audio.createBufferSource(),ng=audio.createGain(),filter=audio.createBiquadFilter();noise.buffer=buffer;filter.type='lowpass';filter.frequency.value=block?4800:heavy?1300:2800;ng.gain.value=.09;noise.connect(filter).connect(ng).connect(audio.destination);noise.start(at);noise.onended=()=>{noise.disconnect();filter.disconnect();ng.disconnect()};
 }
 function mood(who:Side,kind:Mood,tick:number,urgent=false){const state=moods[who];if(!urgent&&tick<state.next)return;state.kind=kind;state.until=tick+(kind==='fear'?72:48);state.next=tick+180;state.material.map=icon(kind);state.material.needsUpdate=true;}
 function event(engine:Practice8,e:Event8,reduced:boolean){
  health??=engine.actors.map(a=>({...a.initial}));if(e.kind==='hit'&&e.target!==undefined&&e.slot)health[e.target][e.slot]=Math.max(0,health[e.target][e.slot]-(e.amount??0));
  if(e.kind==='break'&&e.target!==undefined)mood(e.target,'fear',e.tick,true);
  if(e.kind==='parry')mood(e.who,'pride',e.tick);
  if(e.kind==='hit'&&e.target!==undefined){const a=engine.actors[e.target],low=Math.min(health[e.target].head/a.initial.head,health[e.target].torso/a.initial.torso)<.3;if(low)mood(e.target,'fear',e.tick);else if((e.amount??0)>=10)mood(e.target,'anger',e.tick);if((e.amount??0)>=15)mood(e.who,'pride',e.tick);}
  if(['hit','block','parry','guard_break','shot'].includes(e.kind))sound(e);
  if(!reduced&&e.point&&['hit','block','parry','shot'].includes(e.kind)){
   const material=new T.SpriteMaterial({map:icon('impact'),color:e.kind==='parry'?'#83eaff':e.kind==='block'?'#edb76f':'#fff3da',transparent:true,depthWrite:false,rotation:((e.id*17)%24)/24*Math.PI});
   const sprite=new T.Sprite(material);sprite.position.fromArray(e.point);scene.add(sprite);bursts.push({sprite,start:e.tick,end:e.tick+(e.kind==='shot'?4:9),strength:e.kind==='shot'?.38:Math.min(.65,.30+(e.amount??0)/100)});
  }
 }
 function pose(engine:Practice8,reduced:boolean){for(const [i,p]of paths.entries()){p.line.visible=!reduced&&p.points.length>1;p.material.color.set(engine.actors[i].specialUntil>engine.tick&&engine.actors[i].build.style==='speed'?'#55efff':'#ffe0b5');p.material.opacity=.42*Math.max(0,1-(engine.tick-p.last)/9);const attribute=p.geometry.attributes.position;for(let n=0;n<p.points.length;n++){const v=p.points[n];attribute.setXYZ(n,v.x,v.y,v.z)}attribute.needsUpdate=true;p.geometry.setDrawRange(0,p.points.length);}
 for(const [i,m]of moods.entries()){const a=engine.actors[i];m.sprite.visible=engine.tick<m.until&&a.deadAt===null;if(m.sprite.visible){const head=a.assembly.model.getObjectByName('head');m.sprite.position.copy(head?.getWorldPosition(new T.Vector3())??a.position.clone().add(new T.Vector3(0,3,0))).add(new T.Vector3(.45,.80,0));m.material.opacity=Math.min(1,(m.until-engine.tick)/12);m.sprite.scale.setScalar(reduced?.64:.68+.07*Math.sin((m.until-engine.tick)*.12));}}
  for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];if(engine.tick>=b.end){b.sprite.removeFromParent();(b.sprite.material as T.Material).dispose();bursts.splice(i,1);continue}const t=(engine.tick-b.start)/(b.end-b.start);b.sprite.scale.setScalar(b.strength*(.6+t));(b.sprite.material as T.SpriteMaterial).opacity=(1-t)*.85;}
 }
 function reset(){health=null;for(const p of paths){p.points=[];p.last=-1;p.action=-1;p.line.visible=false}for(const m of moods){m.until=-1;m.next=0;m.sprite.visible=false}for(const b of bursts){b.sprite.removeFromParent();(b.sprite.material as T.Material).dispose()}bursts.length=0;lastSound=-100;}
 return {event,pose,track,reset,enableSound,inspect:()=>moods.map(m=>({kind:m.kind,until:m.until,visible:m.sprite.visible})),dispose(){reset();for(const p of paths){p.line.removeFromParent();p.geometry.dispose();p.material.dispose()}for(const m of moods){m.sprite.removeFromParent();m.material.dispose()}textures.forEach(t=>t.dispose());if(audio)void audio.close();}};
}

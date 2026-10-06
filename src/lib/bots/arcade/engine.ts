import {ART,BUFFER,HZ,LEFT,RIGHT,RULES,type Action,type Build,type Command,type Fighter,type Hit,type MatchSnapshot,type Move,type MoveId,type Phase,type Projectile,type Settings} from './types';
import {isSignature,moveFor,totalFrames} from './moves';
import {replay as replayV1} from './v1/engine';
import type {MatchSnapshot as LegacySnapshot} from './v1/types';

const q=(n:number)=>Math.round(n*1000)/1000;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const other=(s:0|1)=>(1-s) as 0|1;
export function freshFighter(build:Build,side:0|1):Fighter{return {build:structuredClone(build),x:side?835:445,y:0,vx:0,vy:0,facing:side?-1:1,hp:build.health,guard:build.guard,energy:0,heat:0,wins:0,held:{},move:null,frame:0,enhanced:false,armed:false,contact:false,actionId:0,stun:0,blockstun:0,down:0,invulnerable:0,buffer:null,combo:0,comboDamage:0,comboAge:0,juggles:0,armourUsed:false,throwBy:null,throwUntil:0,dash:0,dashSign:1,lastTap:{left:-100,right:-100},notice:'',noticeUntil:0,walk:0,wallUsed:false,vent:0,aiNext:0,aiHeldUntil:0,damageMarks:0};}
export const ready=(f:Fighter)=>!f.move&&!f.stun&&!f.blockstun&&!f.down&&f.throwBy===null;
export const crouching=(f:Fighter)=>!f.y&&!!f.held.down&&!f.move&&!f.down;
export const guarding=(f:Fighter)=>!f.move&&!f.stun&&!f.down&&f.throwBy===null&&!f.y&&!!f.held.guard;
export function strikePoint(f:Fighter,m:Move){
 // These anchors are authored alongside the full-character contact frames.
 const p=clamp((f.frame-m.startup+1)/Math.max(1,m.active),0,1);
 return {x:q(f.x+f.facing*(m.target.x+(p-.5)*8)),y:q(f.y+m.target.y)};
}
type Observation={x:number;y:number;move:MoveId|null;frame:number;facing:1|-1;guard:boolean;down:boolean;hp:number};
type Contact={side:0|1;move:Move;point:{x:number;y:number};projectile?:Projectile};

/** Simulation owns time, contact and result. No DOM, textures or renderer imports. */
export class ArcadeEngine {
 tick=0;clock=90*HZ;phase:Phase='intro';phaseFrames=90;round=1;draws=0;winner:0|1|null=null;roundWinner:0|1|null=null;hitstop=0;
 fighters:[Fighter,Fighter];projectiles:Projectile[]=[];events:Hit[]=[];commands:Command[]=[];sequence=0;actionSequence=0;projectileSequence=0;
 settings:Settings;seed:number;randomState:number;observations:Observation[][]=[];
 constructor(builds:[Build,Build],seed=75,settings:Partial<Settings>={}){
  this.fighters=[freshFighter(builds[0],0),freshFighter(builds[1],1)];this.seed=seed>>>0;this.randomState=this.seed||1;
  this.settings={difficulty:'normal',training:false,dummy:'fight',unlimited:false,...settings};
 }
 random(){let n=this.randomState;n^=n<<13;n^=n>>>17;n^=n<<5;this.randomState=n>>>0;return this.randomState/4294967296;}
 notice(side:0|1,message:string){this.fighters[side].notice=message;this.fighters[side].noticeUntil=this.tick+45;}
 event(kind:Hit['kind'],side:0|1,x:number,y:number,damage=0,move?:MoveId,combo?:number){this.events.push({tick:this.tick,kind,side,x,y,damage,move,combo});}
 input(side:0|1,action:Action,down=true,record=true){
  if(record)this.commands.push({tick:this.tick,sequence:++this.sequence,side,action,down});
  const f=this.fighters[side],fresh=down&&!f.held[action];
  if(action==='clear'){f.held={};f.buffer=null;return;}
  f.held[action]=down;
  if(!fresh)return;
  if(action==='skip'&&this.phase==='intro'){this.phase='fight';this.phaseFrames=0;return;}
  if(action==='finish'&&this.phase==='finish'&&this.winner===side){this.phase='finisher';this.phaseFrames=300;this.event('finish',side,f.x,160);return;}
  if(this.phase!=='fight')return;
  if(action==='throw'&&f.throwBy!==null&&this.tick<=f.throwUntil){
   const attacker=this.fighters[f.throwBy];attacker.move=null;attacker.stun=12;attacker.vx=-attacker.facing*5;f.throwBy=null;f.stun=12;f.vx=-f.facing*5;this.event('tech',side,f.x,150);return;
  }
  if(action==='escape'){
   if(f.energy<3000||f.stun<=0||!f.combo){this.notice(side,f.energy<3000?'Escape needs 3 energy':'Escape during a combo');return;}
   f.energy=0;f.stun=0;f.down=0;f.vy=0;f.y=0;f.combo=0;f.juggles=0;f.invulnerable=24;f.move=null;
   const r=this.fighters[other(side)];r.move=null;r.stun=24;r.vx=f.facing*9;f.vx=-f.facing*9;this.event('escape',side,f.x,120);return;
  }
  if(action==='enhance'){f.armed=!f.armed;this.notice(side,f.armed?'Next Special enhanced':'Enhancement off');return;}
  if(action==='up'&&ready(f)&&!f.y){f.vy={tank:13.5,speed:17,ranged:15}[f.build.style];f.y=.01;f.vx=this.direction(f)*f.build.speed;return;}
  if(action==='up'&&f.y&&f.build.style==='speed'&&!f.wallUsed&&(f.x<=LEFT+4||f.x>=RIGHT-4)){
   f.wallUsed=true;f.vy=14;f.vx=f.x<=LEFT+4?8:-8;return;
  }
  if(action==='left'||action==='right'){
   if(this.tick-f.lastTap[action]<=13||f.held.dash)this.dash(side,action==='right'?1:-1);
   f.lastTap[action]=this.tick;return;
  }
  if(action==='dash'){this.dash(side,this.direction(f)||f.facing);return;}
  const forward=this.direction(f)===f.facing;
  let id:MoveId|undefined;
  if(action==='light')id=f.y?'airLight':f.held.down?'low':forward?'step':f.move==='jab'&&f.contact?'cross':'jab';
  if(action==='heavy')id=f.y?'airHeavy':f.held.down?'launcher':forward?'overhead':'heavy';
  if(action==='special')id=f.held.down?'ground':forward?'advance':'special';
  if(action==='super')id='super';if(action==='throw')id='throw';
  if(id)this.request(side,id);
 }
 direction(f:Fighter){return Number(!!f.held.right)-Number(!!f.held.left);}
 dash(side:0|1,sign:number){const f=this.fighters[side];if(!ready(f)||f.y)return;f.dash=12;f.dashSign=sign;}
 request(side:0|1,id:MoveId){
  const f=this.fighters[side];
  if(ready(f)&&!this.hitstop){this.start(side,id);return;}
  if(f.move){const m=moveFor(f.move,f.build);
   if(f.contact&&f.frame>=m.startup&&f.frame<=m.startup+m.active+11&&m.cancels.includes(id)){
    if(this.hitstop)f.buffer={id,until:this.tick+BUFFER+this.hitstop};else this.start(side,id);return;
   }
   if(totalFrames(m)-f.frame<=BUFFER){f.buffer={id,until:this.tick+BUFFER+this.hitstop};this.notice(side,'Buffered');return;}
  }
  if(this.hitstop&&ready(f)){f.buffer={id,until:this.tick+BUFFER+this.hitstop};return;}
  this.notice(side,f.down?'Getting up':f.stun?'Hitstun':f.blockstun?'Blockstun':'Recovering');
 }
 start(side:0|1,id:MoveId){
  const f=this.fighters[side],m=moveFor(id,f.build);
  const enhanced=f.armed&&isSignature(id)&&id!=='super',cost=m.cost+(enhanced?1000:0);
  if(f.energy<cost&&!this.settings.unlimited){this.notice(side,`Needs ${cost/1000} energy`);return false;}
  if(f.y&&!['airLight','airHeavy'].includes(id)){this.notice(side,'Land first');return false;}
  if(!f.y&&['airLight','airHeavy'].includes(id))return false;
  if(m.projectile&&f.build.style==='ranged'&&(f.heat>=82||f.vent>0)){this.notice(side,'Cannon venting');return false;}
  if(id==='ground'&&f.build.style==='ranged'&&this.projectiles.some(p=>p.side===side&&p.mine)){this.notice(side,'Charge already deployed');return false;}
  f.energy=Math.max(0,f.energy-cost);if(enhanced)f.armed=false;
  f.enhanced=enhanced;f.move=id;f.frame=0;f.contact=false;f.armourUsed=false;f.actionId=++this.actionSequence;f.buffer=null;f.dash=0;
  f.notice=m.name;f.noticeUntil=this.tick+30;return true;
 }
 step(){
  this.tick++;
  if(this.phase!=='fight'){
   if(this.phase==='result')return;
   this.phaseFrames--;
   if(this.phaseFrames<=0){
    if(this.phase==='intro')this.phase='fight';
    else if(this.phase==='roundEnd')this.nextRound();
    else if(this.phase==='finish'||this.phase==='finisher')this.phase='result';
   }return;
  }
  this.observe();this.ai();
  if(this.hitstop){this.hitstop--;return;}
  this.clock--;
  for(const side of [0,1] as const)this.advanceFighter(side);
  this.separate();
  const contacts:Contact[]=[];
  for(const side of [0,1] as const){
   const f=this.fighters[side];if(!f.move)continue;const m=moveFor(f.move,f.build);
   if(f.frame<m.startup||f.frame>=m.startup+m.active)continue;
   if(m.projectile){if(f.frame===m.startup||(m.id==='advance'&&(f.frame-m.startup)%4===0))this.shoot(side,m);continue;}
   if(!f.contact){const point=strikePoint(f,m);if(this.overlap(point,m.radius,this.fighters[other(side)],m.level))contacts.push({side,move:m,point});}
  }
  for(const p of this.projectiles){
   p.life--;const prev=p.x;p.x=q(p.x+p.vx);
   if(p.mine)p.y=Math.max(16,p.y-7);
   const target=this.fighters[other(p.side)];
   const min=Math.min(prev,p.x)-p.radius,max=Math.max(prev,p.x)+p.radius;
   if(!p.hit&&p.life>0&&target.x+36>=min&&target.x-36<=max&&this.overlap({x:clamp(target.x,min,max),y:p.y},p.radius,target,p.mine?'low':'mid')){
    const move={...moveFor(p.move,this.fighters[p.side].build),damage:p.damage,level:(p.mine?'low':'mid') as Move['level'],knockdown:p.mine||p.move==='super'};
    contacts.push({side:p.side,move,point:{x:clamp(target.x,min,max),y:p.y},projectile:p});
   }
  }
  // Snapshot both defences before applying either contact: genuine trades are legal.
  const defences=contacts.map(c=>({guard:guarding(this.fighters[other(c.side)]),crouch:crouching(this.fighters[other(c.side)]),facing:this.fighters[other(c.side)].facing}));
  contacts.forEach((c,i)=>this.resolve(c,defences[i]));
  this.projectiles=this.projectiles.filter(p=>p.life>0&&!p.hit&&p.x>LEFT-100&&p.x<RIGHT+100);
  for(const side of [0,1] as const){const f=this.fighters[side];
   if(f.throwBy!==null&&this.tick>f.throwUntil){
    const by=f.throwBy;f.throwBy=null;const a=this.fighters[by],m=moveFor('throw',a.build);this.damage(by,m,{x:f.x,y:130},false);a.contact=true;
   }
  }
  if(this.settings.training){if(this.settings.unlimited)for(const f of this.fighters)f.energy=3000;for(const f of this.fighters)if(f.hp<=0){f.hp=f.build.health;f.down=45;}this.clock=90*HZ;return;}
  if(this.fighters.some(f=>f.hp<=0)||this.clock<=0)this.endRound();
 }
 advanceFighter(side:0|1){
  const f=this.fighters[side],r=this.fighters[other(side)];
  f.invulnerable=Math.max(0,f.invulnerable-1);f.vent=Math.max(0,f.vent-1);f.heat=Math.max(0,q(f.heat-.16));
  f.stun=Math.max(0,f.stun-1);f.blockstun=Math.max(0,f.blockstun-1);f.down=Math.max(0,f.down-1);
  if(f.comboAge>0)f.comboAge--;else if(!f.stun&&!f.down&&!f.y){f.combo=0;f.comboDamage=0;f.juggles=0;}
  if(f.move){f.frame++;const m=moveFor(f.move,f.build);if(f.frame>=totalFrames(m)){f.move=null;f.frame=0;}
   else if(f.frame>=m.startup-3&&f.frame<m.startup+m.active&&(!f.y||m.advance!==0))f.vx=f.facing*m.advance;
  }
  if(ready(f)){f.facing=r.x>=f.x?1:-1;
   if(f.buffer){const b=f.buffer;f.buffer=null;if(this.tick<=b.until)this.start(side,b.id);}
   if(!f.move){if(f.dash){f.vx=f.build.speed*2.2*f.dashSign;f.dash--;}
    else if(!f.y)f.vx=guarding(f)||f.held.down?0:this.direction(f)*f.build.speed;
    f.guard=Math.min(f.build.guard,q(f.guard+(guarding(f)?.025:.15)));
   }
  }else if(f.buffer&&this.tick>f.buffer.until)f.buffer=null;
  if(f.move&&f.buffer&&f.contact){const m=moveFor(f.move,f.build);if(f.frame<=m.startup+m.active+11&&m.cancels.includes(f.buffer.id)){const b=f.buffer;this.start(side,b.id);}}
  f.x=clamp(q(f.x+f.vx),LEFT,RIGHT);f.walk+=Math.abs(f.vx);
  if(f.y||f.vy){f.y=q(f.y+f.vy);f.vy=q(f.vy-(.68+f.juggles*.15));
   if(f.y<=0){f.y=0;f.vy=0;f.wallUsed=false;this.event('land',side,f.x,0);if(f.stun)f.down=Math.max(f.down,26);if(f.move?.startsWith('air')){f.move=null;f.stun=Math.max(f.stun,5);}}
  }
  if(!ready(f)&&!f.y)f.vx=q(f.vx*.82);
 }
 separate(){const [a,b]=this.fighters;if(a.y>135||b.y>135)return;const gap=b.x-a.x,dist=Math.abs(gap);if(dist>=92)return;const sign=gap>=0?1:-1,overlap=92-dist;
  a.x=clamp(a.x-sign*overlap/2,LEFT,RIGHT);b.x=clamp(b.x+sign*overlap/2,LEFT,RIGHT);
  if(Math.abs(a.x-b.x)<92){if(a.x===LEFT||a.x===RIGHT)b.x=a.x+sign*92;else a.x=b.x-sign*92;}
 }
 overlap(p:{x:number;y:number},radius:number,t:Fighter,level:Move['level']){
  if(t.invulnerable||t.down||t.throwBy!==null)return false;
  if(level==='throw')return t.y===0&&!t.stun&&!t.blockstun&&Math.abs(p.x-t.x)<70;
  const top=t.y+(crouching(t)?174:244),bottom=t.y+12;
  if(level==='high'&&crouching(t))return false;
  return p.x+radius>=t.x-39&&p.x-radius<=t.x+45&&p.y+radius>=bottom&&p.y-radius<=top;
 }
 resolve(c:Contact,d:{guard:boolean;crouch:boolean;facing:1|-1}){
  const {side,move:m,point,projectile}=c,a=this.fighters[side],t=this.fighters[other(side)];
  if(projectile){projectile.hit=true;if(projectile.actionId===a.actionId)a.contact=true;}else a.contact=true;
  if(m.level==='throw'){t.throwBy=side;t.throwUntil=this.tick+10;t.move=null;t.vx=0;this.event('throw',side,t.x,150,0,'throw');return;}
  const impactFacing=projectile?.facing??a.facing;
  const toward=projectile&&!projectile.mine?d.facing!==impactFacing:(a.x-t.x)*d.facing>0,block=d.guard&&toward&&(d.crouch?m.level!=='overhead'&&m.level!=='high':m.level!=='low');
  if(block){
   t.guard=Math.max(0,t.guard-(m.damage/t.build.damage)*.31);t.blockstun=m.block;t.vx=impactFacing*(m.push*.14);a.energy=Math.min(3000,a.energy+25);t.energy=Math.min(3000,t.energy+110);
   const chip=isSignature(m.id)?Math.floor(m.damage*.06):0;t.hp=Math.max(1,t.hp-chip);
   if(t.guard===0){t.held.guard=false;t.stun=43;t.guard=t.build.guard*.32;this.event('break',side,point.x,point.y,chip,m.id);}
   else this.event('block',side,point.x,point.y,chip,m.id);
   this.hitstop=Math.max(this.hitstop,4);return;
  }
  this.damage(side,m,point,!!projectile,impactFacing);
 }
 damage(side:0|1,m:Move,point:{x:number;y:number},projectile:boolean,impactFacing?:1|-1){
  const a=this.fighters[side],t=this.fighters[other(side)];
  const scale=Math.max(.35,1-t.combo*.14),damage=Math.round(m.damage*scale*(a.enhanced&&!projectile?1.2:1));
  t.hp=Math.max(0,t.hp-damage);t.combo++;t.comboDamage+=damage;t.comboAge=40;t.damageMarks++;a.energy=Math.min(3000,a.energy+170);t.energy=Math.min(3000,t.energy+100);
  const armoured=t.move&&moveFor(t.move,t.build).armour&&!t.armourUsed&&['jab','cross','low','step','airLight'].includes(m.id);
  if(armoured)t.armourUsed=true;
  else{
   t.move=null;t.buffer=null;t.stun=m.stun;t.blockstun=0;t.vx=(impactFacing??a.facing)*(m.push/6);t.dash=0;
   if(m.launch&&t.juggles<2){t.y=Math.max(.01,t.y);t.vy=m.launch;t.juggles++;if(m.id==='launcher'){a.vy=12.8;a.y=.01;a.vx=a.facing*3.2;}}
   else if(t.y){t.vy=Math.min(t.vy,5);t.juggles=Math.min(4,t.juggles+1);}
   if(m.knockdown){t.down=43;t.vy=t.y?-6:5;t.y=Math.max(.01,t.y);}
  }
  this.hitstop=Math.max(this.hitstop,m.id==='super'?11:m.damage/a.build.damage>90?7:4);
  this.event('hit',side,point.x,point.y,damage,m.id,t.combo);
 }
 shoot(side:0|1,m:Move){const f=this.fighters[side],point=strikePoint(f,m),mine=m.id==='ground';
  this.projectiles.push({id:++this.projectileSequence,side,move:m.id,facing:f.facing,x:point.x,y:point.y,vx:mine?0:f.facing*(m.id==='super'?21:13),life:mine?230:110,damage:Math.round(m.damage*(f.enhanced?1.2:1)),radius:m.id==='super'?35:mine?33:15,mine,actionId:f.actionId,hit:false});
  f.heat+=m.id==='advance'?12:28;if(f.heat>=82){f.vent=65;this.notice(side,'Cannon venting');}this.event('shot',side,point.x,point.y,0,m.id);
 }
 observe(){this.observations.push(this.fighters.map(f=>({x:f.x,y:f.y,move:f.move,frame:f.frame,facing:f.facing,guard:guarding(f),down:crouching(f),hp:f.hp})));if(this.observations.length>65)this.observations.shift();}
 ai(){
  if(this.settings.training&&this.settings.dummy!=='fight'){
   this.fighters[1].held=this.settings.dummy==='block'?{guard:true}:{};return;
  }
  const f=this.fighters[1];if(f.aiHeldUntil<=this.tick){f.held={};}
  if(this.tick<f.aiNext)return;
  const delay={easy:25,normal:17,hard:11}[this.settings.difficulty];
  f.aiNext=this.tick+delay+Math.floor(this.random()*8);
  const seen=this.observations[Math.max(0,this.observations.length-delay)]?.[0];if(!seen)return;
  const distance=Math.abs(seen.x-f.x),sign=seen.x>f.x?1:-1,forward=sign>0?'right':'left',back=sign>0?'left':'right';
  const press=(action:Action)=>{this.input(1,action,true,false);this.input(1,action,false,false);};
  const chance={easy:.40,normal:.69,hard:.86}[this.settings.difficulty];
  f.held={};f.aiHeldUntil=this.tick+delay+9;
  if(f.throwBy!==null&&this.random()<chance*.6){press('throw');return;}
  if(f.move&&f.contact&&this.random()<chance){press(f.move==='jab'?'light':f.move==='cross'?'heavy':'special');return;}
  if(!ready(f))return;
  const incoming=seen.move&&seen.frame<moveFor(seen.move,this.fighters[0].build).startup;
  if(incoming&&distance<245&&this.random()<chance){f.held.guard=true;if(seen.move==='low'||seen.move==='ground')f.held.down=true;return;}
  if(seen.y>50&&distance<210&&this.random()<chance){f.held.down=true;press('heavy');return;}
  // Boss choices observe the same delayed scene and pay the same costs. Their
  // signature windups are longer, giving a visible opening to jump or punish.
  if(f.build.boss){
   if(f.build.tier===4&&distance>300&&this.random()<.55){press('special');return;}
   if(distance>175&&distance<285&&this.random()<.55){f.held[forward]=true;press('special');return;}
   if(distance<185&&seen.guard&&this.random()<.5){f.held.down=true;press('special');return;}
   if(f.energy>=2000&&distance<225&&this.random()<.3){press('super');return;}
  }
  if(f.build.style==='ranged'&&distance>260){if(this.random()<.7){press('special');return;}f.held[back]=true;return;}
  if(distance>170){f.held[forward]=true;if(distance>450&&this.random()<.3)press('dash');return;}
  if(seen.guard&&distance<145&&this.random()<chance){if(distance<120)press('throw');else{f.held.down=true;press('light');}return;}
  if(seen.move&&seen.frame>moveFor(seen.move,this.fighters[0].build).startup+5&&this.random()<chance){press('heavy');return;}
  if(this.random()<.18){f.held[back]=true;return;}
  if(f.energy>=2000&&this.random()<.18){press('super');return;}
  press(this.random()<.62?'light':'special');
 }
 endRound(){
  const [a,b]=this.fighters,ar=a.hp/a.build.health,br=b.hp/b.build.health;
  this.roundWinner=ar===br?null:ar>br?0:1;
  if(this.roundWinner===null)this.draws++;else{this.fighters[this.roundWinner].wins++;this.draws=0;}
  this.projectiles=[];for(const f of this.fighters){f.held={};f.buffer=null;f.move=null;}
  this.event('round',this.roundWinner??0,640,170);
  if(this.fighters.some(f=>f.wins>=2)){this.winner=this.fighters[0].wins>=2?0:1;this.phase='finish';this.phaseFrames=180;}
  else if(this.draws>=3){this.phase='result';this.winner=null;}
  else{this.phase='roundEnd';this.phaseFrames=105;}
 }
 nextRound(){this.round++;this.fighters=this.fighters.map((old,i)=>({...freshFighter(old.build,i as 0|1),energy:old.energy,wins:old.wins})) as [Fighter,Fighter];this.clock=90*HZ;this.hitstop=0;this.phase='intro';this.phaseFrames=60;this.observations=[];}
 resetTraining(){this.fighters=this.fighters.map((f,i)=>freshFighter(f.build,i as 0|1)) as [Fighter,Fighter];this.projectiles=[];this.hitstop=0;this.clock=90*HZ;this.phase='fight';this.observations=[];}
 packet():MatchSnapshot{return{rules:RULES,art:ART,seed:this.seed,builds:this.fighters.map(f=>f.build) as [Build,Build],settings:this.settings,commands:this.commands.slice()};}
 digest(){return JSON.stringify({tick:this.tick,phase:this.phase,clock:this.clock,winner:this.winner,fighters:this.fighters,projectiles:this.projectiles,events:this.events,random:this.randomState});}
}
export function replay(packet:MatchSnapshot,ticks:number):ArcadeEngine;
export function replay(packet:LegacySnapshot,ticks:number):ReturnType<typeof replayV1>;
export function replay(packet:MatchSnapshot|LegacySnapshot,ticks:number){
 if(packet.rules==='mk11-arcade-1'&&packet.art==='mk11-illustrated-1')return replayV1(packet as LegacySnapshot,ticks);
 if(packet.rules!==RULES||packet.art!==ART)throw Error('This replay needs its recorded version.');
 const e=new ArcadeEngine(packet.builds,packet.seed,packet.settings);let i=0;
 while(e.tick<ticks){while(i<packet.commands.length&&packet.commands[i].tick===e.tick){const c=packet.commands[i++];e.input(c.side,c.action,c.down);}e.step();}
 while(i<packet.commands.length&&packet.commands[i].tick===ticks){const c=packet.commands[i++];e.input(c.side,c.action,c.down);}return e;
}

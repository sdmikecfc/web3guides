import {moves} from './moves';
import {contactPoint,attackStep} from './motion';
import {PIT_RULES,PIT_ASSETS,EDGE,BUFFER,type Action,type Attack,type Command,type Fighter,type Side,type Spec,type Move,type InputMove,type PitEvent,type Phase,type Options,type Projectile,type Packet} from './types';
const other=(s:Side)=>(1-s) as Side,clamp=(v:number,l:number,h:number)=>Math.max(l,Math.min(h,v));
type Observation={x:number;y:number;attacking:boolean;startup:boolean;recovering:boolean;level:Move['level']|null;distance:number;stunned:boolean;crouch:boolean};
type Contact={who:Side;target:Side;move:Move;damage:number;enhanced:boolean;instance:number;x:number;y:number;facing:1|-1};
export class PitEngine{
 readonly rules=PIT_RULES;tick=0;clock=0;timer=5400;phase:Phase='intro';phaseFrame=0;round=1;draws=0;winner:Side|null=null;hitstop=0;
 actors:[Fighter,Fighter];projectiles:Projectile[]=[];commands:Command[]=[];events:PitEvent[]=[];private queue:Command[]=[];private serial=0;private instance=0;private eventId=0;private randomState:number;private nextThink=0;private observations:Observation[]=[];
 replay:Command[]|null=null;private replayAt=0;roundWinner:Side|null=null;options:Options;
 constructor(specs:[Spec,Spec],options:Partial<Options>={}){this.options={seed:75,difficulty:'normal',training:false,dummy:'ai',unlimited:false,...options};this.randomState=this.options.seed||1;this.actors=specs.map((spec,i)=>this.makeActor(spec,i as Side)) as [Fighter,Fighter];}
 private makeActor(spec:Spec,side:Side):Fighter{const start=this.options.training?1250:2500;return {spec,x:side?start:-start,y:0,vx:0,vy:0,facing:side?-1:1,hp:spec.hp,guard:spec.guard,energy:0,wins:0,held:new Set(),attack:null,buffer:null,stun:0,blockstun:0,down:0,dash:0,enhance:false,crouch:false,combo:0,comboDamage:0,comboOwner:null,juggles:0,safe:0,lastHit:-100,lastDirection:{direction:0,tick:-100},throwHold:null,reason:'',reaction:null,reactionUntil:0};}
 private rand(){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return this.randomState/4294967296;}
 input(side:Side,action:Action,down=true){
  const c={tick:this.tick+1,sequence:++this.serial,side,action,down};
  // A decision update retains a direction, it does not double-tap it every time.
  if(side===1&&['left','right','guard','down'].includes(action)){
   this.queue=this.queue.filter(v=>!(v.side===side&&v.action===action&&v.tick===c.tick));
   if(this.actors[side].held.has(action)===down)return c;
  }
  this.queue.push(c);return c;
 }
 clear(){for(const side of [0,1] as Side[])this.input(side,'clear');}
 skipIntro(){this.input(0,'skip');}
 private emit(kind:PitEvent['kind'],who:Side,extra:Partial<PitEvent>={}){const a=this.actors[who];this.events.push({id:++this.eventId,tick:this.tick,kind,who,x:a.x,y:a.y+1600,...extra});}
 private reason(a:Fighter,text:string){a.reason=text;a.reasonUntil=this.clock+36;return false;}
 private busy(a:Fighter){return a.stun>0||a.blockstun>0||a.down>0||!!a.throwHold;}
 private moveFor(a:Fighter,action:Action):InputMove|null{
  const forward=a.held.has(a.facing===1?'right':'left'),down=a.held.has('down');
  const old=a.attack,jabString=old&&['light','advance'].includes(old.move.id)&&old.frame>=old.move.startup-BUFFER&&old.frame<=old.move.startup+old.move.active+8;
  // Movement may stay held through a manually entered jab string. The next
  // Light/Heavy remains the advertised follow-up; it is not silently replaced
  // by another entry or an uncancellable overhead. Down still requests a low.
  if(action==='light')return a.y>0?'airLight':down?'low':jabString?'light':forward?'advance':'light';
  if(action==='heavy')return a.y>0?'airHeavy':down?'launcher':jabString?'heavy':forward?'overhead':'heavy';
  if(action==='special')return down?'bodySpecial':forward?'forwardSpecial':'special';
  return action==='throw'||action==='super'?action:null;
 }
 private handle(c:Command){const a=this.actors[c.side];
  if(c.action==='clear'){a.held.clear();a.buffer=null;return;}
  if(c.action==='skip'){if(this.phase==='intro'){this.phase='ready';this.phaseFrame=0;}return;}
  if(!c.down){a.held.delete(c.action);return;}
  if(a.held.has(c.action))return;a.held.add(c.action);
  if(c.action==='finish'){if(this.phase==='finishPrompt'&&this.winner===c.side){this.phase='finisher';this.phaseFrame=0;this.emit('finish',c.side,{target:other(c.side)});}return;}
  if(this.phase!=='fight')return;
  if(c.action==='enhance'){a.enhance=!a.enhance;a.reason=a.enhance?'Enhance armed · 1 energy':'Enhance off';return;}
  if(c.action==='escape'){if(a.energy<300)return this.reason(a,'Escape needs 3 energy');if(a.comboOwner===null||a.combo<2||(!a.stun&&a.y===0))return this.reason(a,'Escape during an enemy combo');a.energy=0;a.stun=0;a.down=0;a.throwHold=null;a.attack=null;a.buffer=null;a.combo=0;a.comboOwner=null;a.safe=24;a.vy=0;a.y=0;a.x=clamp(a.x-a.facing*1100,-EDGE,EDGE);const b=this.actors[other(c.side)];b.attack=null;b.stun=18;this.projectiles=this.projectiles.filter(p=>p.owner!==other(c.side));this.emit('escape',c.side);return;}
  if(c.action==='throw'&&a.throwHold){if(this.clock<=a.throwHold.until){const b=this.actors[a.throwHold.by];a.throwHold=null;a.stun=b.stun=16;a.attack=b.attack=null;a.x-=a.facing*400;b.x-=b.facing*400;this.emit('tech',c.side);}return;}
  if(c.action==='up'){const launching=!!a.attack?.hits.length&&a.attack.move.id==='launcher';if(a.y===0&&!this.busy(a)&&(!a.attack||launching)){a.attack=null;a.dash=0;a.vx=(Number(a.held.has('right'))-Number(a.held.has('left')))*a.spec.speed;a.vy={tank:147,speed:190,ranged:169}[a.spec.style];a.y=1;a.crouch=false;a.reason='Jump';}return;}
  if(c.action==='left'||c.action==='right'){const direction=c.action==='right'?1:-1;if(a.lastDirection.direction===direction&&this.clock-a.lastDirection.tick<=14)this.dash(a,direction);a.lastDirection={direction,tick:this.clock};return;}
  if(c.action==='dash'){this.dash(a,a.held.has('left')?-1:a.held.has('right')?1:a.facing);return;}
  const move=this.moveFor(a,c.action);if(move)this.start(c.side,move,true);
 }
 private dash(a:Fighter,direction:number){if(a.y>0||this.busy(a)||a.attack||a.dash)return this.reason(a,'Dash after recovery');a.dash=12;a.vx=direction*a.spec.speed*2.5;return true;}
 private start(side:Side,id:InputMove,buffer:boolean){const a=this.actors[side],b=this.actors[other(side)],table=moves(a.spec),move=table[id],old=a.attack;
  if(id==='throw'&&(a.y>0||b.y>0))return this.reason(a,'Throws need grounded fighters');
  if((id==='airLight'||id==='airHeavy')&&a.y===0)return this.reason(a,'Jump first');
  const confirmed=!!old?.hits.includes(other(side));
  const cancel=old&&confirmed&&old.move.cancel.includes(id)&&old.frame>=old.move.startup&&old.frame<=old.move.startup+old.move.active+8&&(id!=='light'||b.combo<2);
  if(this.busy(a)||(old&&!cancel)){
   const recovery=old?old.move.startup+old.move.active+old.move.recovery-old.frame:Math.max(a.stun,a.blockstun,a.down);
   // A fresh follow-up just before contact may wait for a genuine hit confirm.
   // There is still one six-frame slot; a block or miss never grants the cancel.
   if(buffer&&!this.busy(a)&&old&&!a.buffer&&old.move.cancel.includes(id)&&old.frame>=old.move.startup-BUFFER&&old.frame<old.move.startup+old.move.active){a.buffer={move:id,until:this.clock+BUFFER,confirmOnly:true};a.reason='Follow-up buffered';a.reasonUntil=0;return true;}
   if(buffer&&recovery<=BUFFER&&!a.buffer){a.buffer={move:id,until:this.clock+BUFFER};a.reason='Buffered';a.reasonUntil=0;return true;}return this.reason(a,a.down?'Getting up':a.stun?'Hitstun':'Recovering');
  }
  // An intentional attack drops held protection until its recovery ends.
  // The guard input stays held, but collision never blocks during an attack.
  const enhanced=['special','forwardSpecial','bodySpecial'].includes(id)&&a.enhance,cost=move.cost+(enhanced?100:0);
  if(a.energy<cost)return this.reason(a,`Needs ${cost/100} energy`);
  const retreat=a.held.has(a.facing===1?'left':'right')&&!a.held.has(a.facing===1?'right':'left');
  const stepScale=retreat&&move.stepIn?(id==='light'?-.6:0):1;
  a.energy-=cost;if(enhanced)a.enhance=false;a.buffer=null;a.dash=0;a.attack={move,frame:0,facing:a.facing,instance:++this.instance,hits:[],enhanced,shots:0,stepScale};a.reason=move.name;a.reasonUntil=0;if(id==='super')this.emit('super',side);return true;
 }
 private ai(){if(this.replay)return;const a=this.actors[1],b=this.actors[0],opt=this.options;
  this.observations.push({x:b.x,y:b.y,attacking:!!b.attack&&b.attack.frame<b.attack.move.startup+b.attack.move.active,startup:!!b.attack&&b.attack.frame<b.attack.move.startup,recovering:!!b.attack&&b.attack.frame>=b.attack.move.startup+b.attack.move.active,level:b.attack?.move.level??null,distance:Math.abs(b.x-a.x),stunned:b.stun>0||b.down>0,crouch:b.crouch});if(this.observations.length>40)this.observations.shift();
  if(opt.training&&opt.dummy==='idle')return;
  if(opt.training&&opt.dummy==='block'){if(!a.held.has('guard'))this.input(1,'guard');return;}
  if(this.clock<this.nextThink)return;
  const delay={easy:22,normal:14,hard:9}[opt.difficulty],o=this.observations[this.observations.length-delay-1];if(!o)return;
  this.nextThink=this.clock+{easy:12,normal:5,hard:3}[opt.difficulty];
  const edge=(action:Action)=>{this.input(1,action,false);this.input(1,action,true);this.input(1,action,false);};
  if(a.throwHold){if(opt.difficulty==='hard'&&this.rand()<.6)edge('throw');return;}
  // Own contact feedback can prepare a response, but opponent decisions only use
  // delayed visible observations. A rival never sees queued player commands.
  if(this.busy(a)){
   if(a.energy>=300&&a.combo>=3&&this.rand()<.65){edge('escape');return;}
   if(a.blockstun>0&&a.blockstun<=6&&!a.buffer&&o.distance<2350&&this.clock-a.lastHit>=delay-6){
    this.input(1,'guard',false);this.input(1,'down',o.level==='high');
    if(o.distance>1700)this.input(1,o.x>a.x?'right':'left');edge('light');
   }else if(a.stun&&a.combo>=1&&a.guard>30){this.input(1,'guard');this.input(1,'down',o.level==='low');}
   return;
  }
  for(const k of ['left','right','guard','down'] as Action[])this.input(1,k,false);
  const chance={easy:.38,normal:.70,hard:.9}[opt.difficulty],toward=o.x>a.x?'right':'left',away=toward==='right'?'left':'right';
  if(a.attack){if(a.attack.hits.includes(0)&&this.rand()<chance){
   if(['light','advance','low'].includes(a.attack.move.id))edge('heavy');
   else if(a.attack.move.id==='heavy'){if(a.energy>=200)edge('super');else{this.input(1,toward);edge('special');}}
  }return;}
  const recentBlock=this.events.slice(-8).some(event=>event.kind==='block'&&event.target===1&&this.tick-event.tick<48);
  // Retaliate after a defended strike instead of holding guard until it breaks.
  if(recentBlock&&this.clock-a.lastHit>=delay&&o.distance<2350&&this.rand()<chance){
   if(o.distance>1800)this.input(1,toward);else if(o.level==='high')this.input(1,'down');edge('light');return;
  }
  if(a.guard<32&&o.distance<2800){
   this.input(1,away);
   if(Math.abs(a.x)<5400){edge('dash');return;}
   if(o.level==='high'){this.input(1,'down');edge('light');}else{edge('up');edge('heavy');}return;
  }
  const recentHit=this.events.slice(-8).some(event=>event.kind==='hit'&&event.target===1&&this.tick-event.tick<65);
  if(recentHit&&!recentBlock&&o.distance<2700){this.input(1,'guard');if(o.level==='low')this.input(1,'down');return;}
  if(o.attacking&&o.distance<2700&&this.rand()<chance){this.input(1,'guard');if(o.level==='low')this.input(1,'down');return;}
  if(o.recovering&&o.distance<2400&&this.rand()<chance){if(o.distance>1750)this.input(1,toward);edge('light');return;}
  if(o.y>450&&o.distance<2300){this.input(1,'down');edge('heavy');return;}
  if(o.distance>1950){if(a.spec.style==='ranged'&&a.spec.weapon.match(/rifle|rotary|cannon/)&&o.distance>3200&&this.rand()<.7)edge('special');else if(o.distance<2600&&this.rand()<chance){this.input(1,toward);edge('light');}else this.input(1,toward);return;}
  if(o.distance<1400&&this.rand()<.3){edge('throw');return;}
  if(this.rand()>(opt.difficulty==='easy'?.7:.93)){this.input(1,away);return;}
  if(a.energy>=200&&this.rand()<.35){edge('super');return;}
  if(a.energy>=100&&this.rand()<.2)edge('enhance');
  const choice=this.rand();if(choice<.25){this.input(1,'down');edge('light');}else if(choice<.48)edge('special');else edge(o.stunned||choice>.8?'heavy':'light');
 }
 step(){this.tick++;
  if(this.replay){while(this.replayAt<this.replay.length&&this.replay[this.replayAt].tick<=this.tick){const c=this.replay[this.replayAt++];this.handle(c);}}else{const due=this.queue;this.queue=[];for(const c of due){this.commands.push(c);this.handle(c);}}
  if(this.phase!=='fight'){this.phaseFrame++;
   if(this.phase==='intro'&&this.phaseFrame>=120){this.phase='ready';this.phaseFrame=0;}
   else if(this.phase==='ready'&&this.phaseFrame>=75){this.phase='fight';this.phaseFrame=0;this.clearHeld();}
   else if(this.phase==='roundEnd'&&this.phaseFrame>=120)this.nextRound();
   else if(this.phase==='finishPrompt'&&this.phaseFrame>=180){this.phase='result';this.phaseFrame=0;}
   else if(this.phase==='finisher'&&this.phaseFrame>=300){this.phase='result';this.phaseFrame=0;}
   return;
  }
  if(this.hitstop>0){this.hitstop--;return;}this.clock++;if(!this.options.training)this.timer--;this.ai();
  for(const side of [0,1] as Side[]){const a=this.actors[side],b=this.actors[other(side)];
   if(this.options.training&&this.options.unlimited&&side===0)a.energy=300;
   for(const key of ['stun','blockstun','down','safe'] as const)a[key]=Math.max(0,a[key]-1);
   if(a.throwHold){if(this.clock>a.throwHold.until){const hold=a.throwHold;a.throwHold=null;this.apply({who:hold.by,target:side,move:moves(this.actors[hold.by].spec).throw,damage:hold.damage,enhanced:false,instance:hold.instance,x:a.x,y:a.y+1600,facing:this.actors[hold.by].facing},false);}continue;}
   if(!a.attack&&!this.busy(a))a.facing=b.x>=a.x?1:-1;
   a.crouch=a.y===0&&!a.down&&((a.held.has('down')&&!a.attack)||a.attack?.move.motion==='low'||a.attack?.move.motion==='slide');
   if(!a.stun&&!a.down&&a.y===0&&a.comboOwner!==null){a.combo=0;a.comboDamage=0;a.comboOwner=null;a.juggles=0;}
   if(a.buffer){if(this.clock>a.buffer.until)a.buffer=null;else if(!this.busy(a)&&((!a.attack&&!a.buffer.confirmOnly)||(a.attack?.hits.includes(other(side))&&a.attack.move.cancel.includes(a.buffer.move))))this.start(side,a.buffer.move,false);}
   if(this.clock-a.lastHit>75&&!a.held.has('guard'))a.guard=Math.min(a.spec.guard,a.guard+.55);
   const direction=Number(a.held.has('right'))-Number(a.held.has('left'));
   if(a.y>0){if(!this.busy(a)){if(!a.attack&&direction)a.vx+=clamp(direction*a.spec.speed-a.vx,-8,8);a.x+=Math.round(a.vx);}}
   else if(a.dash>0){a.dash--;a.x+=Math.round(a.vx);}else if(!this.busy(a)&&!a.attack&&!a.crouch){if(!a.held.has('guard'))a.x+=direction*a.spec.speed;else if(direction===-a.facing)a.x+=Math.round(direction*a.spec.speed*.55);}
   if(a.attack){const r=a.attack;r.frame++;if(r.frame<=r.move.startup+r.move.active&&!this.busy(a))a.x+=Math.round((r.move.travel+(attackStep(r.move,r.frame)-attackStep(r.move,r.frame-1))*(r.stepScale??1))*r.facing);
    if(r.move.projectile&&r.frame>=r.move.startup&&r.frame<r.move.startup+r.move.active){const muzzle=r.move.id==='super'?a.spec.superMuzzle:a.spec.muzzle;const count=r.move.projectile.count;if(r.shots<count&&r.frame-r.move.startup>=r.shots*5){r.shots++;const spread=Math.round((((Math.imul(r.instance+this.options.seed,r.shots*7919)>>>0)%1000)/1000-.5)*140/a.spec.precision);const p:Projectile={id:++this.instance,owner:side,instance:r.instance,x:a.x+r.facing*(muzzle?.[0]??1600),y:a.y+(muzzle?.[1]??1900),z:(muzzle?.[2]??0)*r.facing,vx:r.facing*r.move.projectile.speed,vy:Math.round(spread/20),life:r.move.projectile.life,damage:r.move.damage,move:r.move,enhanced:r.enhanced};this.projectiles.push(p);this.emit('shot',side,{x:p.x,y:p.y,move:r.move.name});}}
    if(r.frame>=r.move.startup+r.move.active+r.move.recovery)a.attack=null;
   }
   if(a.y>0||a.vy>0){a.y=Math.max(0,a.y+a.vy);a.vy-=a.comboOwner===null?9:9+a.combo*2;if(a.y===0){a.vy=0;if(a.comboOwner!==null){a.down=Math.max(a.down,30);a.stun=0;}a.reaction='land';a.reactionUntil=this.clock+12;this.emit('land',side,{y:0});}}
   a.x=clamp(Math.round(a.x),-EDGE,EDGE);
  }
  this.separate();const contacts:Contact[]=[];
  for(const side of [0,1] as Side[]){const a=this.actors[side],b=this.actors[other(side)],r=a.attack;if(!r||r.move.projectile||r.frame<r.move.startup||r.frame>=r.move.startup+r.move.active||(r.hits.includes(other(side))&&!r.move.hitFrames))continue;
   const stage=r.move.hitFrames?Math.max(0,r.move.hitFrames.filter(f=>f<=r.frame-r.move.startup).length-1):0;if(r.strikes?.includes(stage))continue;const m=r.move.hitFrames?{...r.move,knockdown:r.move.knockdown&&stage===r.move.hitFrames.length-1}:r.move;if(m.level==='throw'){if(a.y===0&&b.y===0&&!b.down&&!b.stun&&!b.throwHold&&Math.abs(a.x-b.x)<m.reach){r.hits.push(other(side));contacts.push({who:side,target:other(side),move:m,damage:m.damage,enhanced:false,instance:r.instance,x:b.x,y:1400,facing:r.facing});}continue;}
   const [dx,dy]=contactPoint(a.spec,m,r.frame),x=a.x+r.facing*dx,y=a.y+dy;
   if(this.intersects(b,x,y,m.radius)&&!b.safe&&!b.down){(r.strikes??=[]).push(stage);contacts.push({who:side,target:other(side),move:m,damage:m.damage,enhanced:r.enhanced,instance:r.instance,x,y,facing:r.facing});}
  }
  for(const p of this.projectiles){const b=this.actors[other(p.owner)],previous=p.x;p.x+=p.vx;p.y+=p.vy;p.life--;if(!b.safe&&!b.down&&p.y>=b.y+150&&p.y<=b.y+(b.crouch?1950:3200)&&Math.min(previous,p.x)-250<=b.x+450&&Math.max(previous,p.x)+250>=b.x-450){contacts.push({who:p.owner,target:other(p.owner),move:p.move,damage:p.damage,enhanced:p.enhanced,instance:p.instance,x:b.x,y:p.y,facing:p.vx>0?1:-1});p.life=0;}}
  this.projectiles=this.projectiles.filter(p=>p.life>0&&Math.abs(p.x)<EDGE+3000);
  // Determine protection before mutating either actor, preserving simultaneous trades.
  const guards=contacts.map(c=>{const b=this.actors[c.target];return b.held.has('guard')&&!b.stun&&!b.down&&!b.throwHold&&!b.attack&&!b.dash&&b.y===0&&b.facing===-c.facing&&(b.crouch?['mid','low'].includes(c.move.level):['high','mid','overhead'].includes(c.move.level));});
  const doubleThrow=contacts.filter(c=>c.move.level==='throw').length===2;if(doubleThrow){for(const a of this.actors){a.attack=null;a.stun=16;}this.emit('tech',0);}
  contacts.forEach((c,i)=>{if(doubleThrow&&c.move.level==='throw')return;if(c.move.level==='throw'){const b=this.actors[c.target];if(b.throwHold)return;b.throwHold={by:c.who,until:this.clock+10,damage:c.damage,instance:c.instance};b.attack=null;b.buffer=null;this.emit('throw',c.who,{target:c.target});}else this.apply(c,guards[i]);});
  if(!this.options.training&&(this.actors.some(a=>a.hp<=0)||this.timer<=0))this.resolveRound();
  if(this.options.training)for(const a of this.actors)if(a.hp<=0){a.hp=a.spec.hp;a.stun=0;a.down=0;a.combo=0;a.comboOwner=null;}
 }
 private intersects(a:Fighter,x:number,y:number,radius:number){return x+radius>=a.x-450&&x-radius<=a.x+450&&y+radius>=a.y+150&&y-radius<=a.y+(a.crouch?1950:3200);}
 private separate(){const [a,b]=this.actors;if(Math.abs(a.y-b.y)>1700)return;const d=b.x-a.x;if(Math.abs(d)<1100){const sign=d>=0?1:-1,over=1100-Math.abs(d);a.x=clamp(a.x-sign*Math.ceil(over/2),-EDGE,EDGE);b.x=clamp(b.x+sign*Math.floor(over/2),-EDGE,EDGE);if(Math.abs(b.x-a.x)<1100){if(Math.abs(a.x)===EDGE)b.x=a.x+sign*1100;else a.x=b.x-sign*1100;}}}
 private apply(c:Contact,blocked:boolean){const a=this.actors[c.who],b=this.actors[c.target],m=c.move;
  const physical=!m.projectile&&m.motion!=='pulse';let damage=Math.max(1,Math.round(c.damage*a.spec.power*(physical?1-b.spec.plating:1)*(c.enhanced?1.25:1)));
  b.lastHit=this.clock;b.reaction=m.level;b.reactionUntil=this.clock+18;
  if(blocked){const spend=12+c.damage*.20;if(b.guard<spend){b.guard=0;b.stun=36;b.blockstun=0;this.emit('guardBreak',c.who,{target:c.target,x:c.x,y:c.y});}
   else{b.guard-=spend;b.blockstun=m.blockstun;b.hp=Math.max(1,b.hp-Math.max(1,Math.round(damage*.03)));b.energy=Math.min(300,b.energy+7);a.energy=Math.min(300,a.energy+3);b.x=clamp(b.x+c.facing*m.push,-EDGE,EDGE);a.x=clamp(a.x-c.facing*Math.round(m.push*.35),-EDGE,EDGE);this.hitstop=Math.max(this.hitstop,3);this.emit('block',c.who,{target:c.target,x:c.x,y:c.y,move:m.name});return;}}
  if(a.attack?.instance===c.instance&&!a.attack.hits.includes(c.target))a.attack.hits.push(c.target);
  if(b.comboOwner!==c.who){b.combo=0;b.comboDamage=0;b.juggles=0;}b.comboOwner=c.who;b.combo++;
  damage=Math.round(damage*Math.max(.24,1-(b.combo-1)*.16));b.hp=Math.max(0,b.hp-damage);b.comboDamage+=damage;
  b.attack=null;b.buffer=null;b.dash=0;b.vx=0;b.blockstun=0;b.stun=m.hitstun;b.throwHold=null;
  b.x=clamp(b.x+c.facing*m.push,-EDGE,EDGE);a.energy=Math.min(300,a.energy+Math.max(4,Math.round(damage/b.spec.hp*150)));b.energy=Math.min(300,b.energy+Math.max(3,Math.round(damage/b.spec.hp*120)));
  if(m.launch&&b.juggles<2){b.y=Math.max(b.y,1);b.vy=m.launch-Math.max(0,b.combo-1)*8;b.juggles++;b.reaction='launch';}
  if(m.knockdown){if(b.y>0)b.vy=Math.min(b.vy,-70);else{b.down=38;b.stun=0;b.safe=12;}}
  this.hitstop=Math.max(this.hitstop,m.hitstop);this.emit('hit',c.who,{target:c.target,x:c.x,y:c.y,amount:damage,move:m.name,combo:b.combo});
 }
 private clearHeld(){for(const a of this.actors){a.held.clear();a.buffer=null;}}
 private resolveRound(){const [a,b]=this.actors;this.roundWinner=a.hp===0&&b.hp===0?null:a.hp===0?1:b.hp===0?0:a.hp/a.spec.hp===b.hp/b.spec.hp?null:a.hp/a.spec.hp>b.hp/b.spec.hp?0:1;
  if(this.roundWinner===null)this.draws++;else{this.draws=0;this.actors[this.roundWinner].wins++;}
  this.emit('round',this.roundWinner??0);this.clearHeld();this.phaseFrame=0;
  if(this.draws>=3){this.winner=null;this.phase='result';}
  else if(this.actors.some(a=>a.wins>=2)){this.winner=this.roundWinner;this.phase='finishPrompt';}
  else this.phase='roundEnd';
 }
 private nextRound(){for(const side of [0,1] as Side[]){const old=this.actors[side];this.actors[side]={...this.makeActor(old.spec,side),energy:old.energy,wins:old.wins};}this.projectiles=[];this.timer=5400;this.round++;this.phase='ready';this.phaseFrame=0;this.observations=[];this.hitstop=0;}
 resetTraining(){const specs=this.actors.map(a=>a.spec) as [Spec,Spec];this.actors=[this.makeActor(specs[0],0),this.makeActor(specs[1],1)];this.projectiles=[];this.phase='fight';this.phaseFrame=0;this.timer=5400;this.hitstop=0;this.queue=[];this.events=[];this.observations=[];}
 packet():Packet{return {rules:PIT_RULES,assets:PIT_ASSETS,fighters:this.actors.map(a=>a.spec) as [Spec,Spec],options:{...this.options},commands:(this.replay??this.commands).map(c=>({...c})),endTick:this.tick,practiceOnly:true};}
 digest(){return JSON.stringify({tick:this.tick,clock:this.clock,phase:this.phase,timer:this.timer,winner:this.winner,actors:this.actors.map(a=>({x:a.x,y:a.y,hp:a.hp,energy:a.energy,guard:a.guard,wins:a.wins,combo:a.combo})),events:this.events,projectiles:this.projectiles});}
}

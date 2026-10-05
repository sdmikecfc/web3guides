import * as T from 'three';
import {Practice8,actionRate,needsBackup,type Actor8,type Side} from './v8-engine';
import {KITS,BACKUP_PUNCH,type ActionDef,type WeaponKind} from './weapon-actions';

export const MANUAL_RULES='mk9-manual-practice-9';
export const JUMPS={tank:{height:1.1,ticks:48},ranged:{height:2.4,ticks:64},speed:{height:4.2,ticks:78}} as const;
export const HOLD_TICKS=11,BUFFER_TICKS=12,REACTION_TICKS=12;
export type ControlKind='attack'|'defend'|'dodge'|'shove'|'special'|'clear'|'forward'|'back'|'left'|'right'|'jump'|'heavy';
export type ManualCommand={sequence:number;tick:number;kind:ControlKind;edge:'press'|'release'};
export const MANUAL_ACTIONS:Record<WeaponKind,{quick:number;committed:number;follow?:number}>={
 hammer:{quick:0,committed:1},greatsword:{quick:0,committed:1,follow:2},axe:{quick:2,committed:0},
 flail:{quick:0,committed:1},sword_shield:{quick:0,committed:1},spear_shield:{quick:0,committed:1},
 long_spear:{quick:0,committed:2,follow:1},dual_blades:{quick:0,committed:1,follow:2},
 rifle:{quick:0,committed:1},precision_rifle:{quick:1,committed:0},rotary:{quick:1,committed:0},arm_cannon:{quick:0,committed:2},
};
// A shove uses the existing supported fist pose and actual swept hand geometry.
const SHOVE:ActionDef={...BACKUP_PUNCH,id:'manual.shove',name:'Shove',prepare:10,active:8,recover:14,damage:2,impulse:.42};
// Manual-only pacing: retain equipment handling, but compress its contribution so
// a heavy kit and Tank arms do not stack into a two-to-one cadence disadvantage.
// Durations compensate for V8's unchanged actionRate; raw build stats stay intact.
export function manualHandling(raw:number){return T.MathUtils.clamp(1+(raw-1)*.45,.90,1.28);}
export function manualTiming(def:ActionDef,raw:number,committed=false){
 const clamp=T.MathUtils.clamp,air=def.id.startsWith('manual.air.'),utility=def.id==='manual.shove'||def.path==='punch',gun=['shot','burst','moving_shot','aimed','reacquire','retreat_shot','tracking','transfer','supported','charge'].includes(def.path);
 const scale=raw/manualHandling(raw);
 if(air||utility)return {prepare:def.prepare*scale,active:def.active*scale,recover:def.recover*.8*scale};
 const prepare=committed?clamp(def.prepare*.48,15,28):clamp(def.prepare*.37,9,12);
 const active=gun?Math.max(def.shots*2,def.active*.72):clamp(def.active*.65,10,def.shots>1?20:14);
 const recover=committed?clamp(def.recover*.42,18,24):clamp(def.recover*.38,14,18);
 return {prepare:prepare*scale,active:active*scale,recover:recover*scale};
}
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
const view=(a:Actor8):Actor8=>({...a,position:a.position.clone(),velocity:a.velocity.clone(),hp:{...a.hp},action:a.action?{...a.action,hits:new Set(a.action.hits)}:null});

/** Local practice only. V8 and its authoritative rewards path are unchanged. */
export class ManualPractice9 extends Practice8 {
 commands:ManualCommand[]=[];receipts:{sequence:number;tick:number;accepted:boolean;reason:string}[]=[];
 replayManual:ManualCommand[]|null=null;private queue:ManualCommand[]=[];private seq=0;
 attackPressed:number|null=null;defending=false;guardRequested=false;buffer:{heavy:boolean;expires:number}|null=null;
 message='Read the rival. Choose your moment.';private defendReady=0;private shoveReady=0;private observation:Actor8[]=[];
 lesson=false;
 stamina:[number,number]=[100,100];private staminaRecoveryAt=[0,0];private shoveProtectedUntil=[0,0];counterUntil=0;private defendStarted=-1000;private dodgeThreat:number|null=null;private openingFrom=new Set<number>();private guardOpenedUntil=0;private shoved=new Set<number>();
 private cost(def:ActionDef,who:Side){return def.id==='manual.shove'?18:def.path==='punch'?18:def===KITS[this.actors[who].build.weapon].actions[MANUAL_ACTIONS[this.actors[who].build.weapon].committed]?20:10;}
 private spend(amount:number){if(this.stamina[0]<amount)return this.reject('Low stamina — defend or reposition');this.stamina[0]-=amount;return true;}
 private counter(instance:number){if(this.openingFrom.has(instance))return;this.openingFrom.add(instance);this.counterUntil=this.tick+90;this.stamina[0]=Math.min(100,this.stamina[0]+12);this.message='Counter ready — faster next attack';}

 comboStep=0;comboHits=0;comboUntil=0;private comboAction=0;private chainQueued=false;private airQueued=false;private airQueueUntil=0;private dive:{start:number;end:number;height:number}|null=null;
 get comboReady(){const a=this.actors[0];return this.comboStep>0&&this.comboStep<3&&this.tick<this.comboUntil&&!!a.action&&a.action.id===this.comboAction&&this.events.some(e=>e.kind==='hit'&&e.who===0&&e.actionInstance===this.comboAction);}
 private chainAction(){const kind=this.actors[0].build.weapon,order:Record<WeaponKind,number[]>={hammer:[0,2,1],greatsword:[0,1,2],axe:[1,0,2],flail:[0,2,1],sword_shield:[0,1,2],spear_shield:[0,1,2],long_spear:[0,2,0],dual_blades:[0,1,0],rifle:[0,2,1],precision_rifle:[1,2,0],rotary:[1,2,0],arm_cannon:[0,1,2]};return KITS[kind].actions[order[kind][this.comboStep]];}
 private resetCombo(){this.comboStep=0;this.comboHits=0;this.comboUntil=0;this.chainQueued=false;}
 private quickPress(){const a=this.actors[0];if(this.jumpHeight(0)>.05)return this.airStrike();if(this.tick<this.jumps[0].end){this.airQueued=true;this.airQueueUntil=this.tick+12;this.message='Jump attack queued';return true;}if(this.comboReady){if(this.chainQueued)return this.reject('Next strike already queued');this.chainQueued=true;this.message='Combo follow-up queued';return true;}const ok=this.strike(false);if(ok&&a.action&&!this.buffer){this.comboStep=1;this.comboHits=0;this.comboAction=a.action.id;this.comboUntil=this.tick+120;}return ok;}
 private airStrike(){const a=this.actors[0],j=this.jumps[0];if(this.tick<j.start+12&&this.jumpHeight(0)<JUMPS[a.build.style].height*.35){this.airQueued=true;this.airQueueUntil=j.start+16;this.message='Jump attack queued';return true;}const busy=this.busyReason(true);if(busy){const r=a.action,remaining=r?(r.prepare+r.active+r.recover-r.elapsed)/actionRate(a,this.actors[1],this.tick):99;if(remaining<=BUFFER_TICKS){this.airQueued=true;this.airQueueUntil=this.tick+BUFFER_TICKS;this.message='Jump attack queued';return true;}return this.reject(busy);}if(needsBackup(a))return this.strike(false);if(!this.spend(8))return false;const base=KITS[a.build.weapon].projectile?this.quickAction:this.committedAction;const def:ActionDef={...base,id:'manual.air.'+a.build.weapon,name:KITS[a.build.weapon].projectile?'Jump shot':'Descending strike',path:KITS[a.build.weapon].projectile?base.path:'overhead',prepare:6,active:20,recover:18,damage:base.damage*.85,impulse:Math.min(.60,base.impulse+.12),requires:undefined};if(!this.legal(def)){this.stamina[0]+=8;return this.reject('Arm disabled');}const h=this.jumpHeight(0);this.dive={start:this.tick,end:this.tick+22,height:h};this.jumps[0].end=this.dive.end;this.jumps[0].ready=this.dive.end+24;this.resetCombo();this.startAction(def);this.message=def.name;return true;}
 movement=new Set<ControlKind>();movementTicks=0;
 jumps:{start:number;end:number;ready:number}[]=[{start:-100,end:-100,ready:0},{start:-100,end:-100,ready:180}];
 constructor(...args:ConstructorParameters<typeof Practice8>){super(...args);this.eventVersion=2;this.auto=[false,true];this.actors[0].guard=this.guardMax;this.actors[0].nextAction=0;for(const a of this.actors){const articulate=a.assembly.articulate;
  a.assembly.articulate=(value,motion)=>{if(!motion)return articulate(value,motion);const who=this.actors.indexOf(a),guard=a.guardRaised,deflect=this.defencePulse?.[who]??0,dodging=a.dodgeUntil>this.tick?Math.sin(Math.PI*T.MathUtils.clamp((a.dodgeUntil-this.tick)/16,0,1)):0;
   return articulate(value,{...motion,path:!a.action&&!needsBackup(a)&&(a.guardUntil>this.tick||a.guardRaised>.001)?'guard':motion.path,manual:{tick:this.tick,style:a.build.style,guard,deflect,dodge:dodging,counter:who===0&&this.counterUntil>this.tick}});};
  a.position.z=0;for(const f of Object.values(a.feet)){f.plant.z-=a.position.z;f.from.copy(f.plant);f.to.copy(f.plant);}}}
 jumpHeight(who:Side){if(who===0&&this.dive&&this.tick>=this.dive.start&&this.tick<this.dive.end){const t=(this.tick-this.dive.start)/(this.dive.end-this.dive.start);return this.dive.height*(1-t*t);}const j=this.jumps?.[who];if(!j||this.tick>=j.end||this.tick<j.start)return 0;const t=(this.tick-j.start)/(j.end-j.start);return JUMPS[this.actors[who].build.style].height*4*t*(1-t);}
 private jump(who:Side){const a=this.actors[who],j=this.jumps[who];if(this.tick<j.ready||this.tick<j.end||a.action||a.downUntil>this.tick||a.dodgeUntil>this.tick||a.specialEnding&&a.specialUntil>this.tick||a.hp.legL<=0||a.hp.legR<=0||this.stamina[who]<12)return false;
  this.stamina[who]-=12;j.start=this.tick;j.end=this.tick+JUMPS[a.build.style].ticks;j.ready=j.end+(who===0?24:120);a.guardUntil=0;a.parryUntil=0;if(who===0){this.defending=false;this.message='Jump — attack in the air or land ready';}this.emit({kind:'movement',who,reason:'jump',point:a.position.toArray()});return true;}
 get rivalOpening(){const a=this.actors[1];return this.tick<this.rivalRecoveryUntil||!!a.action&&a.action.elapsed>=a.action.prepare+a.action.active;}
 get guardMax(){const a=this.actors[0];return Math.max(24,KITS[a.build.weapon].guard)*a.build.stats.guardScale;}
 get heavy(){return this.attackPressed!==null&&this.tick-this.attackPressed>=HOLD_TICKS;}
 get followUp(){const a=this.actors[0],index=MANUAL_ACTIONS[a.build.weapon].follow,def=index===undefined?null:KITS[a.build.weapon].actions[index];return def&&this.legal(def)?def:null;}
 get quickAction(){const a=this.actors[0];if(needsBackup(a))return BACKUP_PUNCH;if(this.followUp)return this.followUp;const kit=KITS[a.build.weapon],def=kit.actions[MANUAL_ACTIONS[a.build.weapon].quick];return a.build.weapon==='axe'&&!this.legal(def)?kit.actions[1]:def;}
 get committedAction(){const a=this.actors[0];return needsBackup(a)?BACKUP_PUNCH:KITS[a.build.weapon].actions[MANUAL_ACTIONS[a.build.weapon].committed];}
 command(kind:ControlKind,edge:'press'|'release'='press'){
  if(this.done||this.replayManual)return false;
  this.queue.push({sequence:++this.seq,tick:this.tick+1,kind,edge});return true;
 }
 clearControls(){if(!this.replayManual&&!this.done){this.command('clear');this.attackPressed=null;this.defending=false;this.guardRequested=false;this.buffer=null;this.chainQueued=false;this.airQueued=false;this.movement.clear();this.actors[0].guardUntil=0;this.actors[0].parryUntil=0;}}
 private releaseRecovery(){const a=this.actors[0],r=a.action;if(!r||r.elapsed<r.prepare+r.active+r.recover*.3)return;const remaining=(r.prepare+r.active+r.recover-r.elapsed)/actionRate(a,this.actors[1],this.tick);this.interrupt(a);a.nextAction=Math.max(a.nextAction,this.tick+Math.ceil(remaining));}
 private raiseGuard(){const a=this.actors[0];this.releaseRecovery();if(this.busyReason(true)||this.tick<this.defendReady||a.guard<8)return false;this.defending=true;this.defendStarted=this.tick;this.buffer=null;this.defendReady=this.tick+24;a.guardUntil=this.tick+2;if(!KITS[a.build.weapon].projectile&&!needsBackup(a))a.parryUntil=this.tick+9;this.message='Guarding';return true;}
 private reject(reason:string){this.message=reason;return false;}
 private legal(def:ActionDef){const a=this.actors[0];return !(def.requires==='parry'&&a.riposteUntil<=this.tick)&&!(def.requires==='opening'&&(a.openingUntil<=this.tick||!['cross','thrust','overhead'].includes(a.lastPath)))&&!(def.path==='combo'&&a.hp.armL<=0)&&!(def.path==='supported'&&a.hp.armL<=0);}
 private busyReason(defensive=false){const a=this.actors[0];if(a.hp.armL<=0&&a.hp.armR<=0)return 'Arms disabled';if(a.downUntil>this.tick||a.specialEnding&&a.specialUntil>this.tick)return 'Recovering';if(a.action||!defensive&&a.nextAction>this.tick)return 'Recovering';if(a.dodgeUntil>this.tick)return 'Dodging';return '';}
 private startAction(def:ActionDef){const a=this.actors[0];this.defending=false;a.guardUntil=0;a.parryUntil=0;a.previous=[];
  const committed=def===this.committedAction,timing=manualTiming(def,a.build.stats.attackSpeed,committed);if(this.counterUntil>this.tick&&def.id!=='manual.shove')timing.prepare*=.7;
  a.action={def,start:this.tick,elapsed:0,...timing,id:++this.sequence,hits:new Set(),shots:0,mount:a.hp.armR>0?'R':'L'};
  if(def.id!=='manual.shove')this.counterUntil=0;
  a.exchangeCount++;this.message=def.name;this.emit({kind:'prepare',who:0,action:def.id,reason:'player command'});
 }
 get attackStatus(){const a=this.actors[0],busy=this.busyReason(this.jumpHeight(0)>.05);if(busy)return a.downUntil>this.tick?'Knocked down — getting up':busy;if(a.heat>=82)return 'Weapon cooling';const air=this.jumpHeight(0)>.05,cost=air?8:10;if(this.stamina[0]<cost)return 'Stamina recovering — move or defend';return air?'Jump attack ready':`Ready · ${this.quickAction.name}`;}
 private strike(heavy:boolean,buffered=false){const a=this.actors[0],b=this.actors[1],busy=this.busyReason();
  if(busy){const remaining=a.action?(a.action.prepare+a.action.active+a.action.recover-a.action.elapsed)/actionRate(a,b,this.tick):a.nextAction-this.tick;
   if(!buffered&&busy==='Recovering'&&remaining>0&&remaining<=BUFFER_TICKS&&!this.buffer){this.buffer={heavy,expires:this.tick+BUFFER_TICKS+30};this.message='Attack buffered';return true;}return this.reject(busy);}
  if(a.heat>=82)return this.reject('Weapon cooling');
  const def=heavy?this.committedAction:this.quickAction;
  if(!this.legal(def))return this.reject('Follow-up unavailable');
  if(!this.spend(heavy?20:10))return false;this.startAction(def);return true;
 }
 private apply(c:ManualCommand){const a=this.actors[0];let accepted=true;if(c.kind==='dodge'&&c.edge==='press')this.releaseRecovery();
  if(c.kind==='clear'){this.attackPressed=null;this.defending=false;this.guardRequested=false;this.buffer=null;this.chainQueued=false;this.airQueued=false;this.movement.clear();a.guardUntil=0;a.parryUntil=0;this.message='Controls released';}
  else if(['forward','back','left','right'].includes(c.kind)){if(c.edge==='press')this.movement.add(c.kind);else this.movement.delete(c.kind);}
  else if(c.kind==='attack'){
   if(c.edge==='press'){if(this.attackPressed!==null)accepted=false;else{this.attackPressed=this.tick;accepted=this.quickPress();}}
   else this.attackPressed=null;
  }else if(c.kind==='defend'){
   if(c.edge==='release'){this.guardRequested=false;this.defending=false;a.guardUntil=0;a.parryUntil=0;}
   else{this.guardRequested=true;if(!this.defending&&!this.raiseGuard())this.message='Guard queued — keep holding';}
  }else if(c.edge==='release')accepted=false;
  else if(c.kind==='heavy'){this.resetCombo();accepted=this.strike(true);}
  else if(c.kind==='jump'){this.releaseRecovery();accepted=this.jump(0);if(!accepted)this.reject(a.hp.legL<=0||a.hp.legR<=0?'Leg disabled':this.stamina[0]<12?'Low stamina':'Jump recovering');}
  else if(c.kind==='special'){accepted=this.special(0,`manual-${c.sequence}`);if(!accepted)this.reject(a.meter<100?'Special charging':'Recovering');else this.message='Special activated';}
  else if(this.busyReason(c.kind==='dodge'))accepted=this.reject(this.busyReason(c.kind==='dodge'));
  else if(c.kind==='dodge'){
   if(a.hp.legL<=0||a.hp.legR<=0)accepted=this.reject('Leg disabled');
   else if(this.tick<a.nextDefence)accepted=this.reject('Dodge recovering');
   else if(!this.spend(18))accepted=false;
   else{const b=this.actors[1],dir=b.position.clone().sub(a.position).normalize(),side=V(dir.z,0,-dir.x),left=a.position.clone().addScaledVector(side,1.2),right=a.position.clone().addScaledVector(side,-1.2);
    const sign=left.lengthSq()<=right.lengthSq()?1:-1,back=!KITS[b.build.weapon].projectile&&b.action&&['cross','reverse'].includes(b.action.def.path);
    if(b.action&&a.position.distanceTo(b.position)<KITS[b.build.weapon].range+.5)this.dodgeThreat=b.action.id;
    const input=this.moveVector(dir);a.dodge.copy(input.lengthSq()?input:dir.clone().negate()).multiplyScalar(a.build.stats.speed*2.3);a.dodgeUntil=this.tick+16;a.nextDefence=this.tick+66;
    this.defending=false;a.guardUntil=0;a.parryUntil=0;this.message='Dodging';this.emit({kind:'movement',who:0,reason:'player dodge',point:a.position.toArray(),direction:a.dodge.clone().normalize().toArray()});}
  }else if(c.kind==='shove'){
   if(this.tick<this.shoveReady)accepted=this.reject('Shove recovering');else if(!this.spend(18))accepted=false;else{this.shoveReady=this.tick+90;this.startAction(SHOVE);}
  }
  this.receipts.push({sequence:c.sequence,tick:this.tick,accepted,reason:this.message});
 }
 step(){if(this.done)return;const a=this.actors[0];this.guardBefore=a.guard;
  this.defencePulse[0]*=.82;this.defencePulse[1]*=.82;
  const eventStart=this.events.length,riposte=a.riposteUntil;
  super.step();
  for(const who of [0,1] as Side[]){const actor=this.actors[who];if(actor.action||actor.dodgeUntil>this.tick||this.jumpHeight(who)>0)this.staminaRecoveryAt[who]=this.tick+12;else if(this.tick>=this.staminaRecoveryAt[who])this.stamina[who]=Math.min(100,this.stamina[who]+.5);if(this.jumps[who].end===this.tick){this.emit({kind:'movement',who,reason:'landing',point:actor.position.toArray()});if(who===0)this.message='Landed';}}
  if(a.riposteUntil>riposte)this.counter(this.actors[1].action?.id??-this.tick);
  for(const event of this.events.slice(eventStart)){
   if(event.kind==='block'&&event.target!==undefined)this.defencePulse[event.target]=1;
   if(event.kind==='parry')this.defencePulse[this.actors[event.who].riposteUntil>this.tick?event.who:event.target??event.who]=1;
   if(event.kind==='hit'&&event.who===0&&event.actionInstance===this.comboAction){this.comboHits++;this.comboUntil=this.tick+75;this.message=`${this.comboHits} hits — ${this.comboStep<3?'press Attack to link':'combo finished'}`;}
   if((event.kind==='hit'&&event.target===0)||(event.kind==='block'&&event.who===0)||(event.kind==='parry'&&event.target===0))this.resetCombo();
   if(event.kind==='block'&&event.target===0&&this.tick-this.defendStarted<=12)this.counter(event.actionInstance??-this.tick);
   if(event.kind==='miss'&&event.who===1&&event.actionInstance===this.dodgeThreat){this.counter(event.actionInstance!);this.dodgeThreat=null;}
  }

  // Base firearm kits have no AI guard pool. The manual brace has a bounded pool.
  if(KITS[a.build.weapon].guard===0)a.guard=Math.max(0,Math.min(this.guardMax,a.guard+(this.defending?0:.18*a.build.stats.guardScale)));
  this.guardSpent=0;
  if(this.defending){a.guard=Math.max(0,a.guard-this.guardMax/900);if(a.guard<1||a.downUntil>this.tick||a.hp.armL<=0&&a.hp.armR<=0){this.defending=false;a.guardUntil=0;a.parryUntil=0;this.defendReady=this.tick+60;this.message='Guard exhausted';}}
  this.observation.push(view(a));if(this.observation.length>REACTION_TICKS+1)this.observation.shift();
 }
 defencePulse:[number,number]=[0,0];
 private guardSpent=0;private guardBefore=0;
 private bracedHits=new Set<number>();
 private rivalRecoveryUntil=0;private rivalShoveReady=0;
 intent(who:Side,rival?:Actor8){if(who===1){
   const a=this.actors[1],kit=KITS[a.build.weapon];
   if(this.lesson&&this.tick<300){a.nextAction=Math.max(a.nextAction,300);a.nextDefence=Math.max(a.nextDefence,300);}
   // A real recovery window after every completed attack: no instant chase dash
   // or chained attack while a human is reading the previous exchange.
   if(a.lastAttackEnd===this.tick){this.rivalRecoveryUntil=this.tick+18;a.nextAction=this.rivalRecoveryUntil;a.nextBurst=Math.max(a.nextBurst,this.rivalRecoveryUntil+30);}
   if(this.stamina[1]<20)a.nextAction=Math.max(a.nextAction,this.tick+1);
   if(this.stamina[1]<18){a.nextBurst=Math.max(a.nextBurst,this.tick+1);a.nextDefence=Math.max(a.nextDefence,this.tick+1);}
   const seen=this.observation[0];
   if(seen?.action&&seen.action.elapsed>seen.action.prepare*.5&&seen.action.elapsed<seen.action.prepare&&Math.abs(a.position.x-seen.position.x)<6&&this.stamina[1]>55)this.jump(1);
   const recent=this.events.filter(e=>e.who===0&&e.kind==='prepare'&&e.tick<=this.tick-REACTION_TICKS).slice(-3);
   const repeated=recent.length>=2&&recent[recent.length-1].action===recent[recent.length-2].action;
   // Read completed, visible tells, never pending inputs. Repeating the same
   // frontal attack invites a guard; shove, a counter or an angle can beat it.
   if(repeated&&seen?.action&&seen.action.elapsed<seen.action.prepare+seen.action.active&&!a.action&&a.downUntil<=this.tick&&this.tick>=this.guardOpenedUntil&&kit.guard>0&&a.hp.armL>0&&a.hp.armR>0&&a.guard>8&&a.position.distanceTo(seen.position)<KITS[seen.build.weapon].range+.5){a.guardUntil=Math.max(a.guardUntil,this.tick+12);a.nextBurst=Math.max(a.nextBurst,this.tick+24);}
   const before=a.position.clone(),previousAction=a.action?.id,previousDodge=a.dodgeUntil;
   // A crowded rifle or polearm needs a close-range response too. Read the
   // delayed visible position, and use the same contact-driven shove as the player.
   if(seen&&!a.action&&a.downUntil<=this.tick&&a.dodgeUntil<=this.tick&&a.nextAction<=this.tick&&this.tick>=this.rivalShoveReady&&this.stamina[1]>=18&&(kit.projectile||a.build.weapon==='spear_shield'||a.build.weapon==='long_spear')&&a.position.distanceTo(seen.position)<2.95&&(a.hp.armR>0||a.hp.armL>0)){
    a.guardUntil=0;a.parryUntil=0;a.previous=[];a.action={def:SHOVE,start:this.tick,elapsed:0,prepare:SHOVE.prepare,active:SHOVE.active,recover:SHOVE.recover,id:++this.sequence,hits:new Set(),shots:0,mount:a.hp.armR>0?'R':'L'};this.rivalShoveReady=this.tick+90;this.emit({kind:'prepare',who:1,action:SHOVE.id,reason:'create space'});
   }
   super.intent(who,this.observation[0]??{...rival!,action:null});
   if(a.action&&a.action.id!==previousAction){Object.assign(a.action,manualTiming(a.action.def,a.build.stats.attackSpeed,a.action.def===kit.actions[MANUAL_ACTIONS[a.build.weapon].committed]));this.stamina[1]=Math.max(0,this.stamina[1]-this.cost(a.action.def,1));}
   if(a.dodgeUntil>previousDodge)this.stamina[1]=Math.max(0,this.stamina[1]-18);
   if(this.tick<this.guardOpenedUntil){a.guardUntil=0;a.parryUntil=0;}
   if(this.tick<this.rivalRecoveryUntil&&!a.action&&a.dodgeUntil<=this.tick&&a.downUntil<=this.tick){
    a.position.copy(before).addScaledVector(a.velocity,.2/60);a.velocity.multiplyScalar(.2);a.footwork='brace';
   }
   a.position.z=0;a.velocity.z=0;a.knockback.z=0;a.yaw=-Math.PI/2;if(a.dodgeUntil>this.tick){a.dodge.z=0;if(Math.abs(a.dodge.x)<.1)a.dodge.x=a.build.stats.speed*1.8;}
   return;
  }
  if(this.actors[0].lastAttackEnd===this.tick)this.actors[0].nextAction=Math.min(this.actors[0].nextAction,this.tick+6);
  if(KITS[this.actors[0].build.weapon].guard===0)this.actors[0].guard=this.guardBefore;
  for(const c of this.replayManual??this.queue)if(c.tick===this.tick){this.commands.push({...c});this.apply(c);}
  this.queue=this.queue.filter(c=>c.tick>this.tick);
  const a=this.actors[0],b=rival??this.actors[1],kit=KITS[a.build.weapon];
  if(this.comboStep&&this.tick>this.comboUntil)this.resetCombo();
  if(this.airQueued){if(this.tick>this.airQueueUntil||this.tick>=this.jumps[0].end){this.airQueued=false;}else if(this.jumpHeight(0)>.05&&(this.tick>=this.jumps[0].start+12||this.jumpHeight(0)>=JUMPS[a.build.style].height*.35)&&!this.busyReason(true)){this.airQueued=false;this.airStrike();}}
  if(this.chainQueued){const r=a.action;if(!r||r.id!==this.comboAction){this.resetCombo();}else if(r.elapsed>=r.prepare+r.active+2){const def=this.chainAction();if(def.requires==='opening'){a.openingUntil=this.tick+30;a.lastPath=r.def.path;}if(this.legal(def)&&!needsBackup(a)&&this.stamina[0]>=10){this.stamina[0]-=10;this.comboStep++;this.chainQueued=false;this.startAction(def);a.action!.prepare=Math.min(a.action!.prepare,this.comboStep===3?20:10);this.comboAction=a.action!.id;this.comboUntil=this.tick+100;this.message=`Combo ${this.comboStep}/3 · ${def.name}`;}else{this.resetCombo();this.message='Combo ended';}}}
  if(this.guardRequested&&!this.defending){this.raiseGuard();if(this.defending)this.resetCombo();}
  if(this.buffer){if(this.tick>this.buffer.expires){this.buffer=null;this.message='Buffered attack expired';}else if(!this.busyReason()){const heavy=this.buffer.heavy;this.buffer=null;if(this.strike(heavy,true)&&a.action&&!heavy){this.comboStep=1;this.comboHits=0;this.comboAction=a.action.id;this.comboUntil=this.tick+120;}}}
  if(this.defending&&!a.action&&a.downUntil<=this.tick)a.guardUntil=this.tick+2;
  if(a.downUntil>this.tick){a.velocity.multiplyScalar(.75);a.position.addScaledVector(a.velocity,1/60);return;}
  const dir=b.position.clone().sub(a.position),distance=dir.length();dir.normalize();const desired=Math.atan2(dir.x,dir.z),slow=b.specialUntil>this.tick&&b.build.style==='ranged'?.7:1,over=a.specialUntil>this.tick&&a.build.style==='speed';
  if(a.action&&a.action.elapsed>=a.action.prepare-(kit.projectile?8:4)&&a.action.lockYaw===undefined){a.action.lockYaw=a.yaw;a.action.aimPoint=b.position.clone().add(V(0,b.coreHeight,0)).toArray();}
  if(a.action?.lockYaw!==undefined)a.yaw=a.action.lockYaw;else a.yaw+=T.MathUtils.clamp(angle(desired-a.yaw),-a.build.stats.turn*slow/60,a.build.stats.turn*slow/60);
  const speed=a.build.stats.speed*slow*(over?1.5:1)*(this.jumpHeight(0)>0?1.15:1)*(a.hp.legL<=0||a.hp.legR<=0?.4:1);
  const movement=this.moveVector(dir);if(movement.lengthSq())this.movementTicks++;
  // Direction stays player-owned. A prepared melee swing permits a deliberate step in;
  // contact and recovery reduce travel, so it cannot become a full-speed running attack.
  let travel=1;
  if(a.action)travel=a.action.elapsed<a.action.prepare?.8:a.action.elapsed<a.action.prepare+a.action.active?.45:.55;
  if(this.defending)travel=.35;
  movement.multiplyScalar(speed*travel);
  const forward=movement.dot(dir),lateral=movement.dot(V(dir.z,0,-dir.x));
  a.footwork=forward>.1?'approach':forward<-.1?'backstep':Math.abs(lateral)>.1?'circle':'brace';
  if(a.dodgeUntil>this.tick){movement.copy(a.dodge);a.footwork='evade';}
  if(a.specialEnding&&a.specialUntil>this.tick&&a.build.style==='speed'&&a.hp.legL>0&&a.hp.legR>0)movement.copy(b.position).add(V(-Math.sin(b.yaw)*1.9,0,-Math.cos(b.yaw)*1.9)).sub(a.position).clampLength(0,speed*1.5);
  if(a.position.length()>6.6){const outward=a.position.clone().normalize(),radial=movement.dot(outward);if(radial>0)movement.addScaledVector(outward,-radial);}
  a.velocity.lerp(movement,a.dodgeUntil>this.tick?.8:.65);a.position.addScaledVector(a.velocity,1/60);a.gait+=a.velocity.length()/60;a.position.z=0;a.velocity.z=0;a.knockback.z=0;a.yaw=Math.PI/2;
 }
 private moveVector(_dir:T.Vector3){return V(T.MathUtils.clamp(Number(this.movement.has('forward')||this.movement.has('right'))-Number(this.movement.has('back')||this.movement.has('left')),-1,1),0,0);}
 pose(){
  // Ground positions own lane spacing; the sampled jump translates the entire rig
  // before swept contacts are checked. Rendering uses these same world matrices.
  const [a,b]=this.actors;for(const actor of this.actors){actor.position.z=0;actor.position.y=0;actor.position.x=T.MathUtils.clamp(actor.position.x,-6.8,6.8);}
  const gap=(a.build.style==='tank'?1.32:1.06)+(b.build.style==='tank'?1.32:1.06);if(b.position.x-a.position.x<gap){const mid=T.MathUtils.clamp((a.position.x+b.position.x)/2,-6.8+gap/2,6.8-gap/2);a.position.x=mid-gap/2;b.position.x=mid+gap/2;}
  a.yaw=Math.PI/2;b.yaw=-Math.PI/2;super.pose();
  for(const who of [0,1] as Side[]){const actor=this.actors[who],height=this.jumpHeight(who);actor.root.position.y+=height;if(actor.downUntil>this.tick){const elapsed=48-(actor.downUntil-this.tick),fall=T.MathUtils.smoothstep(elapsed,0,10)*(1-T.MathUtils.smoothstep(elapsed,30,48));actor.root.rotateX(-1.12*fall);actor.root.position.y+=.12*fall;}if(height>0){const tuck=Math.sin(Math.PI*(this.tick-this.jumps[who].start)/(this.jumps[who].end-this.jumps[who].start))*(actor.build.style==='speed'?.65:.25);for(const side of ['L','R']){const knee=actor.assembly.model.getObjectByName('knee'+side);if(knee)knee.rotation.x+=tuck;}}actor.root.updateMatrixWorld(true);}
 }
 damage(...args:Parameters<Practice8['damage']>){const [who,target,amount,impulse,action,hit,direction]=args,b=this.actors[target],a=this.actors[who];let braceBlocked=false;
  // Shield geometry retains its original blocking rule. Other equipment braces
  // against frontal melee only; a rifle cannot block a bullet with an invisible shield.
  if((target===0?this.defending:b.guardUntil>this.tick)&&!hit.proxy.shield&&!KITS[a.build.weapon].projectile&&b.parryUntil<=this.tick&&b.guardUntil>this.tick&&b.downUntil<=this.tick&&!(b.build.style==='tank'&&b.specialUntil>this.tick&&b.shield>0)&&V(Math.sin(b.yaw),0,Math.cos(b.yaw)).dot(a.position.clone().sub(b.position).normalize())>.45){
   const cost=amount*.45+impulse*20;if(b.guard>=cost){braceBlocked=true;b.guard-=cost;this.guardSpent+=cost;args[2]=amount*.30;args[3]=Math.min(args[3],.2);this.emit({kind:'block',who,target,action,amount:amount*.70,point:hit.point.toArray(),reason:'partial weapon brace'});}
   else{b.guard=0;if(target===0){this.guardSpent=this.guardMax;this.defending=false;this.defendReady=this.tick+60;}b.guardUntil=0;b.parryUntil=0;this.emit({kind:'guard_break',who,target,action,point:hit.point.toArray()});}
  }
  const shoveProtected=action==='manual.shove'&&this.tick<this.shoveProtectedUntil[target];
  if(shoveProtected)args[3]=.04;
  if(action==='manual.shove'&&!shoveProtected)this.shoveProtectedUntil[target]=this.tick+180;
  if(who===0&&action==='manual.shove'&&!shoveProtected&&b.downUntil<=this.tick&&!this.shoved.has(a.action?.id??-1)){this.shoved.add(a.action?.id??-1);
   // Contact may be with the guard itself. Open it; do not bypass it for damage.
   this.guardOpenedUntil=this.tick+60;b.guardUntil=0;b.parryUntil=0;b.guard=Math.max(0,b.guard-22*b.build.stats.guardScale);this.interrupt(b);b.nextAction=Math.max(b.nextAction,this.tick+42);this.rivalRecoveryUntil=Math.max(this.rivalRecoveryUntil,this.tick+42);this.message='Guard opened — follow with an attack';
   this.emit({kind:'guard_break',who,target,action,point:hit.point.toArray(),reason:'shove opened guard'});
  }
  const prepared=b.action,previous=b.previous,oldNext=b.nextAction,from=this.events.length;
  const attacking=a.action,quick=!!attacking&&attacking.def!==KITS[a.build.weapon].actions[MANUAL_ACTIONS[a.build.weapon].committed]&&action!=='manual.shove';

  const canBrace=!!prepared&&prepared.def.id!=='manual.shove'&&prepared.def===KITS[b.build.weapon].actions[MANUAL_ACTIONS[b.build.weapon].committed]&&prepared.elapsed>=prepared.prepare*.25&&prepared.elapsed<prepared.prepare&&!this.bracedHits.has(prepared.id)&&impulse<.25;
  super.damage(...args);
  const contact=this.events.slice(from).find(e=>e.kind==='hit'&&e.target===target);
  const blocked=braceBlocked||this.events.slice(from).some(e=>e.kind==='block');
  if(who===0&&quick&&blocked&&a.action===attacking&&b.hp.armL>0&&b.hp.armR>0){
   this.interrupt(a);a.nextAction=Math.max(a.nextAction,this.tick+24);b.guardUntil=0;b.parryUntil=0;b.nextAction=this.tick+6;this.rivalRecoveryUntil=this.tick;this.message='Guard caught your swing — defend or dodge';
  }

  const physicalFinish=!!attacking&&!KITS[a.build.weapon].projectile&&(attacking.def===KITS[a.build.weapon].actions[MANUAL_ACTIONS[a.build.weapon].committed]&&impulse>=.4||action.startsWith('manual.air.'));
  if(contact&&!blocked&&(contact.amount??0)>0&&!(contact.mitigation?.shield)&&b.hp.torso>0&&b.hp.head>0){
   const alreadyDown=this.events.slice(from).some(e=>e.kind==='knockdown');
   if(alreadyDown||physicalFinish&&b.immuneUntil<=this.tick){
    b.downUntil=this.tick+48;b.immuneUntil=b.downUntil+150;this.interrupt(b);b.nextAction=b.downUntil+6;b.guardUntil=0;b.parryUntil=0;
    if(this.jumps[target].end>this.tick)this.jumps[target].end=this.tick;if(target===0){this.dive=null;this.airQueued=false;this.defending=false;this.message='Knocked down — getting up';}else this.message='Knockdown — make space for your next attack';
    if(!alreadyDown)this.emit({kind:'knockdown',who,target,action,point:hit.point.toArray(),actionInstance:attacking?.id,reason:'committed contact'});
   }
  }

  // Resist one light interruption, never its damage. Early preparation, heavy
  // impacts, broken limbs and knockdowns can still stop a committed swing.
  if(canBrace&&prepared&&!b.action&&contact&&(contact.amount??0)<b.initial.torso*.18&&b.downUntil<=this.tick&&b.hp.armL>0&&b.hp.armR>0&&b.hp.head>0&&b.hp.torso>0){
   b.action=prepared;b.previous=previous;b.nextAction=oldNext;b.recoveryPose=undefined;this.bracedHits.add(prepared.id);contact.reason='braced preparation';if(target===0)this.message='Braced hit — swing continues';
  }
 }
 snapshot(){return {...super.snapshot(),rulesVersion:MANUAL_RULES,motionVersion:'mk9-manual-motion-3',manualVersion:9 as const,manualLesson:this.lesson,commands:this.commands.map(c=>({...c})),receipts:this.receipts.map(r=>({...r})),practiceOnly:true};}
}

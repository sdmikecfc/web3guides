/** Versioned preview rules. One weapon chooses actions on every body family. */
import {PREVIEW_VERSIONS} from './asset-versions';
export const RULES_VERSION='mk8-practice-'+PREVIEW_VERSIONS.rules;
export const MOTION_VERSION='mk8-weapon-motion-'+PREVIEW_VERSIONS.motion;
export type WeaponKind='hammer'|'greatsword'|'axe'|'flail'|'sword_shield'|'spear_shield'|'long_spear'|'dual_blades'|'rifle'|'precision_rifle'|'rotary'|'arm_cannon';
export type ActionPath='ready'|'punch'|'guard'|'cross'|'overhead'|'rise'|'thrust'|'reverse'|'shield'|'beat'|'butt'|'combo'|'riposte'|'shot'|'burst'|'moving_shot'|'aimed'|'reacquire'|'retreat_shot'|'tracking'|'transfer'|'supported'|'charge';
export type ActionDef={id:string;name:string;path:ActionPath;prepare:number;active:number;recover:number;damage:number;impulse:number;shots:number;heat:number;spread:number;requires?:'opening'|'parry';};
export type KitDef={kind:WeaponKind;name:string;hands:number;shield:boolean;projectile:boolean;range:number;minimum:number;guard:number;actions:readonly ActionDef[]};
function a(kind:string,name:string,path:ActionPath,prepare:number,active:number,recover:number,damage:number,impulse=0,shots=1,heat=0,spread=0,requires?:ActionDef['requires']):ActionDef{return {id:kind+'.'+path,name,path,prepare,active,recover,damage,impulse,shots,heat,spread,requires}}
export const KITS:Record<WeaponKind,KitDef>={
 hammer:{kind:'hammer',name:'Warhammer',hands:2,shield:false,projectile:false,range:3.2,minimum:1.9,guard:48,actions:[a('hammer','Compact cross strike','cross',27,16,36,24,.32),a('hammer','Overhead crush','overhead',44,14,54,39,.74),a('hammer','Rising diagonal','rise',34,17,44,29,.46)]},
 greatsword:{kind:'greatsword',name:'Greatsword',hands:2,shield:false,projectile:false,range:3.45,minimum:2.1,guard:40,actions:[a('greatsword','Diagonal cut','cross',28,16,34,26,.18),a('greatsword','Straight thrust','thrust',31,12,39,28,.14),a('greatsword','Returning cut','reverse',18,15,35,22,.13,1,0,0,'opening')]},
 axe:{kind:'axe',name:'Battle axe',hands:2,shield:false,projectile:false,range:3.15,minimum:1.95,guard:38,actions:[a('axe','Diagonal chop','overhead',35,16,46,34,.33),a('axe','Horizontal sweep','cross',37,20,43,30,.35),a('axe','Recovery chop','reverse',22,14,39,24,.23,1,0,0,'opening')]},
 flail:{kind:'flail',name:'Chain flail',hands:1,shield:false,projectile:false,range:3.25,minimum:2.1,guard:14,actions:[a('flail','Side cast','cross',35,22,48,29,.32),a('flail','Descending cast','overhead',43,20,52,34,.42),a('flail','Low diagonal cast','rise',32,24,47,27,.27)]},
 sword_shield:{kind:'sword_shield',name:'Sword & buckler',hands:1,shield:true,projectile:false,range:2.6,minimum:1.7,guard:66,actions:[a('sword_shield','Covered thrust','thrust',20,12,28,20,.08),a('sword_shield','Outside cut','cross',23,16,31,23,.10),a('sword_shield','Shield check','shield',23,12,38,10,.53)]},
 spear_shield:{kind:'spear_shield',name:'Spear & shield',hands:1,shield:true,projectile:false,range:3.9,minimum:2.6,guard:60,actions:[a('spear_shield','Direct thrust','thrust',29,12,37,26,.13),a('spear_shield','Changed-line thrust','beat',32,14,38,27,.10),a('spear_shield','Shortened close thrust','butt',23,11,33,16,.14)]},
 long_spear:{kind:'long_spear',name:'Two-handed spear',hands:2,shield:false,projectile:false,range:4.05,minimum:2.7,guard:30,actions:[a('long_spear','Measured thrust','thrust',28,12,36,29,.12),a('long_spear','Beat and thrust','beat',20,12,38,25,.15,1,0,0,'parry'),a('long_spear','Short butt strike','butt',19,12,31,15,.29)]},
 dual_blades:{kind:'dual_blades',name:'Twin blades',hands:1,shield:false,projectile:false,range:2.55,minimum:1.65,guard:24,actions:[a('dual_blades','Lead cut','cross',16,12,24,16,.06),a('dual_blades','Alternating combination','combo',22,26,36,28,.09,2),a('dual_blades','Parry riposte','riposte',14,12,28,20,.09,1,0,0,'parry')]},
 rifle:{kind:'rifle',name:'Field rifle',hands:2,shield:false,projectile:true,range:7.7,minimum:3.5,guard:0,actions:[a('rifle','Settled shot','shot',28,1,37,25,.07,1,13,.018),a('rifle','Controlled burst','burst',33,18,46,34,.08,3,26,.034),a('rifle','Moving shot','moving_shot',22,1,35,21,.05,1,16,.10)]},
 precision_rifle:{kind:'precision_rifle',name:'Precision rifle',hands:2,shield:false,projectile:true,range:9,minimum:4.2,guard:0,actions:[a('precision_rifle','Braced shot','aimed',47,1,55,43,.12,1,23,.010),a('precision_rifle','Reacquired shot','reacquire',32,1,48,31,.08,1,18,.025),a('precision_rifle','Retreat and set','retreat_shot',40,1,47,33,.09,1,22,.032)]},
 rotary:{kind:'rotary',name:'Rotary cannon',hands:2,shield:false,projectile:true,range:7.6,minimum:3.7,guard:0,actions:[a('rotary','Braced burst','burst',31,40,44,44,.09,8,38,.044),a('rotary','Tracking burst','tracking',25,36,42,36,.07,7,34,.07),a('rotary','Lane transfer burst','transfer',41,30,38,35,.08,6,30,.042)]},
 arm_cannon:{kind:'arm_cannon',name:'Arm cannon',hands:1,shield:false,projectile:true,range:7.2,minimum:3.25,guard:12,actions:[a('arm_cannon','Direct shot','shot',24,1,38,24,.13,1,15,.035),a('arm_cannon','Supported shot','supported',32,1,42,29,.20,1,20,.023),a('arm_cannon','Charged shot','charge',59,1,55,46,.57,1,37,.018)]},
};

// Preview tuning pass 3 (unfrozen): short-range kits need enough pressure to compensate
// for approach exposure; precision trades a longer aim window for each shot.
const tuning:Partial<Record<WeaponKind,number>>={hammer:.90,long_spear:1.35,sword_shield:1.0,dual_blades:1.10,spear_shield:1.55,flail:1.06,rifle:1.0,precision_rifle:.74,rotary:.93,arm_cannon:.57};
for(const [kind,factor] of Object.entries(tuning))for(const action of KITS[kind as WeaponKind].actions)action.damage*=factor!;

// Only available when the installed kit loses its required arm(s). No additional intact-kit damage.
export const BACKUP_PUNCH:ActionDef=a('backup','Last-arm punch','punch',18,12,29,11,.12);

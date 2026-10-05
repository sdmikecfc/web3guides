import type {Build8} from './v8-engine';
import {KITS} from './weapon-actions';
import {itemStats} from './equipment-stats';
import type {Entry,Slot} from './parts-assembly';

export function visibleStats(build:Build8){
 const move=KITS[build.weapon].actions[0],s=build.stats;
 return [
  {key:'health',label:'Body health',value:s.body,digits:0,suffix:'',help:'Damage the body can survive. Each limb has its own health.'},
  {key:'armour',label:'Armour',value:s.plating*100,digits:1,suffix:'%',help:'Physical damage reduction. Capped at 35%. Precision rifles bypass half of this armour.'},
  {key:'movement',label:'Move speed',value:s.speed/2.15*100,digits:0,suffix:'%',help:'100% is standard movement speed. Legs provide most of this stat.'},
  {key:'weaponSpeed',label:'Weapon speed',value:60*s.attackSpeed/(move.prepare+move.active+move.recover),digits:2,suffix:'/s',help:'Full cycles of the first weapon move per second, before movement, pauses or interruptions.'},
  {key:'damage',label:'Move damage',value:move.damage*s.power,digits:1,suffix:'',help:'Damage of the first weapon move before armour. A burst divides this damage among its shots.'},
  {key:'precision',label:'Precision',value:s.precision*100,digits:0,suffix:'%',help:'Higher precision narrows shot spread. This is not a hit chance.'},
  {key:'turn',label:'Turn speed',value:s.turn*180/Math.PI,digits:0,suffix:'°/s',help:'How quickly the robot can turn to face a target.'},
 ];
}

function add(container:HTMLElement,tag:string,value:string){const el=document.createElement(tag);el.textContent=value;container.append(el);return el}
export function renderBuildStats(container:HTMLElement,build:Build8){
 container.replaceChildren();const list=document.createElement('dl');list.className='equipment-stat-list';container.append(list);
 for(const row of visibleStats(build)){const group=document.createElement('div');group.title=row.help;list.append(group);add(group,'dt',row.label);add(group,'dd',row.value.toFixed(row.digits)+row.suffix)}
 add(container,'p',`${Math.round(build.gp)} Gear Points · ${build.style==='tank'?'Energy Shield':build.style==='speed'?'Overdrive':'Slow Field'}${build.tier>=3?' + finisher':''}`);
}

export function renderPartStats(container:HTMLElement,entry:Entry,slot:Slot,current:Build8|null,projected:Build8|null,installed:boolean){
 container.replaceChildren();container.scrollTop=0;add(container,'strong',`${installed?'Fitted: ':'Compare: '}${entry.name.replace(/Â/g,'')}`);
 const stats=itemStats(entry,slot),raw:string[]=[`${Math.round(stats.gearPoints)} GP`];
 if(stats.health)raw.push(`${Math.round(stats.health)} part health`);
 if(stats.armour)raw.push(`${(stats.armour*100).toFixed(1)}% armour rating`);
 if(stats.movement)raw.push(`${Math.round(stats.movement*100)}% mobility`);
 if(stats.attackSpeed)raw.push(`${Math.round(stats.attackSpeed*100)}% handling`);
 if(stats.power)raw.push(`${Math.round(stats.power*100)}% power`);
 if(stats.turning)raw.push(`${Math.round(stats.turning*100)}% turning`);
 if(stats.precision)raw.push(`${Math.round(stats.precision*100)}% precision`);
 add(container,'p',raw.join(' · '));
 if(!current||!projected)return;
 if(installed){add(container,'small','These ratings combine into the robot totals. Hover or focus another part to compare.');return;}
 const before=visibleStats(current),after=visibleStats(projected),list=document.createElement('dl');list.className='equipment-stat-list';container.append(list);let changes=0;
 if(slot!=='torso'&&stats.health){const old=current.itemStats[slot].health,delta=stats.health-old;if(Math.abs(delta)>.05){changes++;const group=document.createElement('div');list.append(group);add(group,'dt','Part health');const value=add(group,'dd',`${Math.round(stats.health)} (${delta>0?'+':''}${Math.round(delta)})`);value.className=delta>0?'stat-up':'stat-down';}}
 for(let i=0;i<after.length;i++){const row=after[i],delta=row.value-before[i].value;if(Math.abs(delta)<.5*10**(-row.digits))continue;changes++;const group=document.createElement('div');group.title=row.help;list.append(group);add(group,'dt',row.label);const value=add(group,'dd',`${row.value.toFixed(row.digits)}${row.suffix} (${delta>0?'+':''}${delta.toFixed(row.digits)})`);value.className=delta>0?'stat-up':'stat-down';}
 if(!changes)add(container,'small','Same robot stats. Choose the look you like.');
 if(current.style!==projected.style||current.tier!==projected.tier&&slot==='torso')add(container,'p',`Special: ${projected.style==='tank'?'Energy Shield':projected.style==='speed'?'Overdrive':'Slow Field'}${projected.tier>=3?' + finisher':''}`);
 add(container,'small','+ / − compares the complete robot with this part fitted. Health for each limb is separate.');
}

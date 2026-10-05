import type {Snapshot8,Side} from './v8-engine';

export function fightReport(fight:Snapshot8){
 const time=(tick:number)=>`${Math.floor(tick/3600)}:${String(Math.floor(tick/60)%60).padStart(2,'0')}`;
 const label=(who:Side)=>who===0?'Your robot':'Rival';
 const part=(slot?:string)=>({armL:'left arm',armR:'right arm',legL:'left leg',legR:'right leg',head:'head',torso:'body'}[slot??'']??'part');
 const events=fight.events;
 const sides=([0,1] as Side[]).map(who=>{
  const hits=events.filter(e=>e.kind==='hit'&&e.who===who&&(e.amount??0)>0);
  return {label:label(who),name:fight.builds[who].name,damage:Math.round(hits.reduce((n,e)=>n+(e.amount??0),0)),hits:hits.length,
   blocks:events.filter(e=>e.kind==='block'&&e.target===who).length,
   recoveryHits:hits.filter(e=>e.reason==='caught recovery').length,
   backupHits:hits.filter(e=>e.action==='backup.punch').length,
   specials:events.filter(e=>e.kind==='special'&&e.who===who).length,
   limbsLost:events.filter(e=>e.kind==='break'&&e.target===who&&/^(arm|leg)/.test(e.slot??'')).length};
 });
 const special=events.find(e=>e.kind==='special');
 const breakEvent=events.find(e=>e.kind==='break'&&/^(arm|leg)/.test(e.slot??''));
 const biggest=events.filter(e=>e.kind==='hit'&&(e.amount??0)>0).sort((a,b)=>(b.amount??0)-(a.amount??0))[0];
 const moments=[special&&{tick:special.tick,text:`${label(special.who)} activated ${{tank:'Energy Shield',speed:'Overdrive',ranged:'Slow Field'}[special.reason??'']??'a special'}.`},
  breakEvent&&{tick:breakEvent.tick,text:`${label(breakEvent.target!)} lost its ${part(breakEvent.slot)}.`},
  biggest&&{tick:biggest.tick,text:`${label(biggest.who)} landed the biggest hit: ${Math.round(biggest.amount!)} damage to the ${part(biggest.slot)}.`}
 ].filter((m):m is {tick:number;text:string}=>!!m).sort((a,b)=>a.tick-b.tick).map(m=>({...m,time:time(m.tick)}));
 const loss=events.find(e=>e.kind==='defeat'&&e.who!==fight.winner);
 const coreBreak=[...events].reverse().find(e=>e.kind==='break'&&e.target!==fight.winner&&['head','torso'].includes(e.slot??''));
 const result=fight.winner===null?'Draw':`${label(fight.winner)} won`;
 const ending=fight.tick>=7200?'The time limit decided the result using remaining body and head armour.':loss?.reason==='both arms disabled'?'The losing robot lost both arms.':loss?'The losing robot’s body or head armour broke.':'The recorded fight ended.';
 return {result,ending,duration:time(fight.tick),sides,moments};
}

export function renderFightReport(container:HTMLElement,fight:Snapshot8){
 const report=fightReport(fight);container.replaceChildren();
 const text=(tag:string,value:string,parent:HTMLElement=container)=>{const node=document.createElement(tag);node.textContent=value;parent.append(node);return node};
 text('p',`${report.result} · ${report.duration}`);text('p',report.ending);
 const table=document.createElement('table');table.className='fight-report-table';container.append(table);
 const head=document.createElement('thead');table.append(head);const headers=document.createElement('tr');head.append(headers);
 for(const title of ['Recorded action','Your robot','Rival']){const th=document.createElement('th');th.scope='col';th.textContent=title;headers.append(th)}
 const body=document.createElement('tbody');table.append(body);
 for(const [label,key] of [['Damage dealt','damage'],['Hits landed','hits'],['Attacks blocked','blocks'],['Hits during rival recovery','recoveryHits'],['Last-arm punches landed','backupHits'],['Specials used','specials'],['Limbs lost','limbsLost']] as const){const row=document.createElement('tr');body.append(row);const th=document.createElement('th');th.scope='row';th.textContent=label;row.append(th);for(const side of report.sides){const td=document.createElement('td');td.textContent=String(side[key]);row.append(td)}}
 text('p','Damage includes hits to the head, body and limbs. Blocks count only attacks stopped by the held shield.');
 if(report.moments.length){text('h3','Key moments');const list=text('ol','');for(const moment of report.moments)text('li',`${moment.time} — ${moment.text}`,list)}
}

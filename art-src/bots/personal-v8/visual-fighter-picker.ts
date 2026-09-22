import type {Entry} from './parts-assembly';
/** Reuse baked thumbnails. Opening a picker never starts another WebGL renderer. */
export function visualFighterPicker(entries:Entry[],dialog:HTMLDialogElement){
 const panel=document.createElement('section');panel.className='visual-pick-panel';panel.hidden=true;panel.setAttribute('aria-label','Visual fighter catalogue');
 const heading=document.createElement('h3'),close=document.createElement('button'),tiers=document.createElement('div'),grid=document.createElement('div');close.textContent='Done choosing';tiers.className='tier-row';grid.className='visual-pick-grid';panel.append(heading,close,tiers,grid);dialog.querySelector('.fight-picks')!.after(panel);
 let selected:HTMLSelectElement|null=null,activeButton:HTMLButtonElement|null=null,tier=3;
 const buttons:{button:HTMLButtonElement;select:HTMLSelectElement}[]=[];
 const image=(entry:Entry,body:boolean)=>body&&entry.tier===3?`/assets/catalogue-2/painted/${entry.family}.png`:`${entry.thumbnailRoot}/${entry.id}.${body?'whole':'weapon'}.png`;
 function refresh(){if(!selected)return;const body=selected.id.startsWith('body'),pool=entries.filter(e=>body?e.slots.length===7:e.id.startsWith('kit1.')).filter(e=>e.tier===tier);heading.textContent=`${selected.id.endsWith('a')?'Your robot':'Rival'} · ${body?'body designs':'weapon kits'} · Tier ${tier}`;
  grid.replaceChildren(...pool.map(e=>{const b=document.createElement('button');b.className='visual-pick-tile';b.setAttribute('aria-pressed',String(selected!.value===e.id));const img=document.createElement('img');img.src=image(e,body);img.alt='';img.loading='lazy';const name=document.createElement('strong'),note=document.createElement('small');name.textContent=e.name;note.textContent=body?`${e.style} · ${e.family}`:e.hands===2?'Two hands':e.offhand?'Weapon + shield':'One hand';b.append(img,name,note);b.onclick=()=>{selected!.value=e.id;selected!.dispatchEvent(new Event('change'));sync();refresh()};return b}));
  tiers.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i+1===tier)));
 }
 for(let i=1;i<=4;i++){const b=document.createElement('button');b.textContent='Tier '+i;b.onclick=()=>{tier=i;refresh()};tiers.append(b)}
 for(const id of ['body-a','weapon-a','body-b','weapon-b']){const select=document.getElementById(id) as HTMLSelectElement,button=document.createElement('button');button.type='button';button.className='visual-pick-current';select.parentElement!.append(button);button.onclick=()=>{selected=select;activeButton=button;tier=entries.find(e=>e.id===select.value)?.tier??3;panel.hidden=false;refresh();panel.scrollIntoView({block:'nearest',behavior:'instant'});close.focus({preventScroll:true})};select.addEventListener('change',sync);buttons.push({button,select})}
 close.onclick=()=>{panel.hidden=true;activeButton?.focus()};
 function sync(){for(const {button,select}of buttons){const e=entries.find(e=>e.id===select.value);if(!e)continue;const img=document.createElement('img');img.src=image(e,select.id.startsWith('body'));img.alt=e.name;const caption=document.createElement('span');caption.textContent='See designs →';button.replaceChildren(img,caption);button.setAttribute('aria-label',`See ${select.id.startsWith('body')?'body':'weapon'} designs for ${select.id.endsWith('a')?'your robot':'rival'}`)}}
 sync();return {sync,dispose(){buttons.forEach(({select})=>select.removeEventListener('change',sync));panel.remove();buttons.forEach(({button})=>button.remove())}};
}

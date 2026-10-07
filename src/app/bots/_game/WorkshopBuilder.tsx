"use client";
import { useEffect, useRef, useState } from "react";
import { ENTRY_MAP, ITEM_MAP, ITEMS, SLOTS, SLOT_NAMES, STYLE_NAMES, STYLE_HELP, SPECIAL_NAMES, preset, itemId, legalChoices, aggregateEquipment, itemStats, defaultAppearance, type Item, type Slot, type Choices } from "@/lib/bots/workshop8/catalogue";
import { PALETTES } from '@/lib/bots/workshop8/appearance';
import { draftCost, type Workshop8, type Action8 } from "@/lib/bots/workshop8/state";
import ConnectedModelRoom from "./ConnectedModelRoom";
import WorkshopItemPages from "./WorkshopItemPages";
import AnimatedFighter from "./AnimatedFighter";
import EntryDialog from "./EntryDialog";
import css from "./workshop-builder.module.css";

export default function WorkshopBuilder({state,busy,act,choose,finish,inspect,journeyPreview=false,previewPaused=false}: {
 journeyPreview?:boolean;previewPaused?:boolean;
 state:Workshop8;busy:boolean;act:(action:Action8)=>Promise<boolean>;choose:(item:Item)=>Promise<unknown>;finish:()=>Promise<void>;inspect:(item:Item)=>void;
}) {
 const draft=state.draft;
 const starterBuild=state.robots.length===0&&state.coins<=250&&state.spares.length===0&&state.history.length===0;
 const [name,setName]=useState(draft?.name??'');const editingName=useRef(false);useEffect(()=>{if(!editingName.current)setName(draft?.name??'')},[draft?.name]);
 const [step,setStep]=useState<"style"|"parts"|"review">(draft?.step==='personalize'?'review':draft?.step??(draft?.choices.torso?'parts':'style'));
 const [slot,setSlot]=useState<Slot>(draft?.slot??SLOTS.find(s=>!draft?.choices[s])??"torso");
 const selectingStyle=useRef(false),savedStep=useRef(`${step}:${slot}`);useEffect(()=>{const next=`${step}:${slot}`;if(!selectingStyle.current&&journeyPreview&&draft&&savedStep.current!==next){savedStep.current=next;void act({kind:'builderStep',step,slot})}},[step,slot,journeyPreview,draft]);
 const [style,setStyle]=useState("all"),[tier,setTier]=useState(state.robots.length?"all":"1");
 const [preview,setPreview]=useState(false),[motionPaused,setMotionPaused]=useState(false);
 const [replaceStyle,setReplaceStyle]=useState<keyof typeof STYLE_NAMES|null>(null);
 const [small,setSmall]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null),previousStep=useRef(step);
 useEffect(()=>{const media=matchMedia("(max-width:650px)");const update=()=>{setSmall(media.matches);if(!media.matches)setPreview(false)};update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update)},[]);
 useEffect(()=>{if(previousStep.current!==step){heading.current?.focus();previousStep.current=step}},[step]);
 const bodyStyle=ENTRY_MAP.get(draft?.choices.torso??"")?.style??"tank";
 const projected={...preset(bodyStyle),...draft?.choices} as Choices;
 const totals=aggregateEquipment(projected,ENTRY_MAP),chosen=SLOTS.filter(s=>draft?.choices[s]).length;
 const items=ITEMS.filter(i=>i.slot===slot&&(style==="all"||i.entry.style===style)&&(starterBuild?i.entry.tier===1:tier==="all"||i.entry.tier===Number(tier)));
 const cost=draftCost(state),complete=!!draft&&legalChoices(draft.choices);
 const spareCount=(id:string)=>state.spares.filter(part=>part.item===id).length;
 const includedSpares=SLOTS.filter(part=>draft?.choices[part]&&spareCount(itemId(draft.choices[part]!,part))>0).length;
 const selectStyle=async(key:keyof typeof STYLE_NAMES,replace=false)=>{
  if(!replace&&draft?.choices.torso&&SLOTS.some(s=>draft.choices[s]&&draft.choices[s]!==preset(bodyStyle)[s])){setReplaceStyle(key);return;}
  selectingStyle.current=true;
  const saved=await act({kind:'draft',draft:{name:draft?.name??'',choices:preset(key),appearance:Object.keys(draft?.choices??{}).length?draft!.appearance:defaultAppearance(ENTRY_MAP.get(preset(key).torso)!.family),step:'parts',slot:'torso'}});
  if(saved){savedStep.current='parts:torso';setStyle(key);setTier('1');setSlot('torso');setStep('parts');setReplaceStyle(null);}
  selectingStyle.current=false;
 };
 const next=()=>{const index=SLOTS.indexOf(slot);const missing=SLOTS.find(s=>!draft?.choices[s]);if(index<6)setSlot(SLOTS[index+1]);else if(missing)setSlot(missing);else setStep("review")};
 const model=!previewPaused&&<ConnectedModelRoom title="Your exact build choices" payload={{robots:[{id:"draft",choices:projected,appearance:draft?.appearance}],visibleSlots:Object.keys(draft?.choices??{})}}/>;
 return <section className={css.builder} data-step={step}>
  <header className={css.heading}>
   <div><span>BUILD YOUR ROBOT · {chosen}/7 PARTS</span><h1 ref={heading} tabIndex={-1}>{step==="style"?"Choose your robot style.":step==="review"?"Name it. Colour it. Finish.":"Choose your parts."}</h1></div>
   <nav aria-label="Build steps" className={css.steps}>
    <button aria-label="Step 1: Style" aria-current={step==="style"?"step":undefined} onClick={()=>setStep("style")}>1 <span>Style</span></button>
    <button aria-label="Step 2: Parts" disabled={!draft?.choices.torso} aria-current={step==='parts'?"step":undefined} onClick={()=>setStep('parts')}>2 <span>Parts</span></button>
    <button aria-label="Step 3: Finish" disabled={!complete} aria-current={step==="review"?"step":undefined} onClick={()=>setStep("review")}>3 <span>Finish</span></button>
   </nav>
  </header>
  {step==="style"?<div className={css.stylePage}>
   <p>{starterBuild?'Your 250 starter coins cover a complete robot. Choose a style, then its parts.':'Choose a style, then choose parts within your coin budget.'}</p>
   <button className={css.motionToggle} onClick={()=>setMotionPaused(v=>!v)} aria-pressed={motionPaused}>{motionPaused?"Play character motion":"Pause character motion"}</button><div className={css.styleCards}>{(Object.keys(STYLE_NAMES) as (keyof typeof STYLE_NAMES)[]).map(key=><button key={key} disabled={busy} aria-label={`${STYLE_NAMES[key]} starter robot`} onClick={()=>void selectStyle(key)}>
    <div className={css.heroImage}><AnimatedFighter style={key} paused={motionPaused||previewPaused}/></div>
    <div><h2>{STYLE_NAMES[key]}</h2><p>{STYLE_HELP[key]}</p><strong>{SPECIAL_NAMES[key]}</strong><span>Choose {STYLE_NAMES[key]} →</span></div>
   </button>)}</div>
   <small>Previews show upgraded fighters. Your starter uses Tier 1 parts.</small>
  </div>:step==="parts"?<>
   <div className={css.partsLayout}>
    <aside className={css.preview}>
     <div className={css.model}>{!small&&model}</div>
     <div className={css.totals}><strong>{totals.gp} Gear Points</strong><span>{SPECIAL_NAMES[bodyStyle]}</span><dl><div><dt>Body health</dt><dd>{Math.round(totals.stats.body)}</dd></div><div><dt>Movement</dt><dd>{totals.stats.speed.toFixed(2)}</dd></div><div><dt>Attack speed</dt><dd>{totals.stats.attackSpeed.toFixed(2)}×</dd></div><div><dt>Armour</dt><dd>{Math.round(totals.stats.plating*100)}%</dd></div></dl>{!complete&&<small>Unchosen slots use starter parts for these totals.</small>}</div>
    </aside>
    <div className={css.picker}>
     <div className={css.slots} aria-label="Robot parts">{SLOTS.map(s=><button key={s} aria-label={SLOT_NAMES[s]} aria-pressed={slot===s} onClick={()=>setSlot(s)}>{draft?.choices[s]?"✓ ":""}{SLOT_NAMES[s]}</button>)}</div>
     <div className={css.pickerTitle}><h2>Choose {SLOT_NAMES[slot].toLowerCase()}.</h2><button className={css.mobileOnly} onClick={()=>setPreview(true)}>See robot</button></div>
     <div className={css.filters}><select aria-label="Build style" value={style} onChange={e=>setStyle(e.target.value)}><option value="all">All styles</option>{Object.entries(STYLE_NAMES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select aria-label="Build tier" value={starterBuild?'1':tier} disabled={starterBuild} onChange={e=>setTier(e.target.value)}>{starterBuild?<option value="1">Tier 1 starter parts</option>:<><option value="all">All tiers</option>{[1,2,3,4].map(t=><option key={t} value={t}>Tier {t}</option>)}</>}</select><span>{starterBuild?'Earn coins in battles for stronger builds.':'Mix parts freely.'}</span></div>
     <WorkshopItemPages items={items} resetKey={`${slot}:${style}:${tier}`} render={item=><article key={item.id} className={css.card} data-selected={draft?.choices[item.slot]===item.entry.id}>
      <button className={css.pickCard} aria-pressed={draft?.choices[item.slot]===item.entry.id} onClick={()=>void choose(item)}>
       <img src={item.image} alt=""/><strong>{item.entry.name}</strong><span>T{item.entry.tier} · {STYLE_NAMES[item.entry.style]} · {spareCount(item.id)?'Owned spare · no extra cost':`${item.price} coins`}</span><small>{item.slot==='weapon'?`${item.entry.weapon.replaceAll('_',' ')} · ${item.entry.weapon.includes('rifle')||['rotary','arm_cannon'].includes(item.entry.weapon)?'Ranged fire':item.entry.weapon.includes('spear')||item.entry.weapon==='greatsword'?'Long reach':'Close reach'}`:`${Math.round(itemStats(item.entry,item.slot).health)} health`} · {itemStats(item.entry,item.slot).gearPoints} GP</small>
      </button><button className={css.details} aria-label={`Stats for ${item.entry.name}`} onClick={()=>inspect(item)}>Stats & comparison ↗</button>
     </article>}/>
    </div>
   </div>
   <footer className={css.actions}><button onClick={()=>starterBuild&&cost>state.coins?setReplaceStyle(bodyStyle):setStep("style")}>{starterBuild&&cost>state.coins?'Use starter parts':'← Style'}</button><span>Cost: {cost} game coins <small>{state.coins} available · {cost>state.coins?'Choose cheaper parts':'Pay only when you finish'}</small></span><button className={css.primary} disabled={busy||!draft?.choices[slot]} onClick={complete?()=>setStep("review"):next}>{complete?"Name & finish →":`Next: ${SLOT_NAMES[SLOTS[SLOTS.indexOf(slot)+1]??SLOTS.find(s=>!draft?.choices[s])??"head"]} →`}</button></footer>
  </>:<>
   <div className={css.reviewLayout}>
    <div className={css.reviewModel}>{model}</div>
    <div className={css.reviewPanel}>
     <label>Robot name<input aria-label="Robot name" value={name} maxLength={32} onFocus={()=>{editingName.current=true}} onChange={e=>setName(e.target.value)} onBlur={e=>{editingName.current=false;if(!(e.relatedTarget as HTMLElement|null)?.hasAttribute("data-finish")&&name!==draft?.name)void act({kind:"nameDraft",name})}} placeholder="Give it a name"/></label>
     {draft&&<fieldset className={css.palette}><legend>Colours · free</legend><div>{Object.entries(PALETTES).map(([palette,paint])=><button key={palette} disabled={busy} aria-label={`Paint ${palette}`} title={palette} style={{background:paint.primary,border:`3px solid ${paint.trim}`}} onClick={()=>void act({kind:'draftAppearance',appearance:defaultAppearance(palette)})}/>)}</div></fieldset>}
     <div className={css.reviewParts}>{SLOTS.map(s=><button key={s} onClick={()=>{setSlot(s);setStep("parts")}}><span>{SLOT_NAMES[s]}</span><strong>{ENTRY_MAP.get(projected[s])?.name}</strong><small>{spareCount(itemId(projected[s],s))?'Owned spare · ':''}Edit →</small></button>)}</div>
     <p>{includedSpares?`${includedSpares} owned ${includedSpares===1?'spare is':'spares are'} included. Finish buys only the missing parts.`:'Finish buys these parts with game coins.'} Upgrade, rename or repaint later.</p>
    </div>
   </div>
   <footer className={css.actions}><button onClick={()=>setStep("parts")}>← Edit parts</button><span>Pay {cost} game coins <small>{state.coins} available · {cost>state.coins?`Need ${cost-state.coins} more`:`${state.coins-cost} left after Finish`}</small></span><button className={css.primary} data-finish disabled={busy||!complete||!name.trim()||cost>state.coins} onClick={()=>void(async()=>{if(name===draft?.name||await act({kind:"nameDraft",name}))await finish()})()}>{cost?'Buy & finish':'Finish robot'}</button></footer>
  </>}
  {preview&&small&&<EntryDialog title="Your robot so far" onClose={()=>setPreview(false)}><div className={css.phoneModel}>{model}</div><p>{totals.gp} GP · {SPECIAL_NAMES[bodyStyle]} · {Math.round(totals.stats.body)} body health</p><p>Movement {totals.stats.speed.toFixed(2)} · Attack speed {totals.stats.attackSpeed.toFixed(2)}× · Armour {Math.round(totals.stats.plating*100)}%</p>{!complete&&<small>Unchosen slots use starter parts for these totals.</small>}<button onClick={()=>setPreview(false)}>Back to parts</button></EntryDialog>}
  {replaceStyle&&<EntryDialog title="Keep your custom parts?" onClose={()=>setReplaceStyle(null)}><p>Choosing {STYLE_NAMES[replaceStyle]} can replace all seven parts with its suggested starter. Your name and colours stay.</p><button onClick={()=>void selectStyle(replaceStyle,true)}>Use suggested parts</button><button onClick={()=>{setReplaceStyle(null);setStep('parts')}}>Keep my custom parts</button></EntryDialog>}
 </section>;
}

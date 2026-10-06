'use client';
import { useEffect, useRef, useState } from 'react';
import { COLLECTIBLES, PACKS, oddsLabel, packItems, usdcLabel, type PackKind, type CollectibleDef } from '@/lib/chef/diner/collectible-packs';
import type { DinerCommand,DinerState } from '@/lib/chef/diner/progression';
import {assignedCopies} from '@/lib/chef/diner/collectible-appearances';
import { ModelIcon } from './ModelIcon';
import css from './collectible-packs.module.css';

export function CollectiblePacks({state,send,place,preview}:{state:DinerState;send:(command:DinerCommand)=>boolean;place:(id:string)=>void;preview:boolean}){
  const [pack,setPack]=useState<PackKind>('regular'),[tab,setTab]=useState<'collection'|'board'>('collection'),[revealed,setRevealed]=useState<CollectibleDef|null>(null),[opening,setOpening]=useState(false);
  const before=useRef<Record<string,number>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{
    if(!before.current)return;
    const item=COLLECTIBLES.find(item=>(state.decorOwned[item.id]??0)>(before.current![item.id]??0));
    if(item){before.current=null;timer.current=setTimeout(()=>{setRevealed(item);setOpening(false);},450);}
  },[state.decorOwned]);
  const spec=PACKS[pack],items=packItems(pack),unique=items.filter(item=>(state.decorOwned[item.id]??0)>0).length;
  const open=()=>{if(opening)return;before.current={...state.decorOwned};setRevealed(null);setOpening(true);if(!send({type:'previewPack',pack})){before.current=null;setOpening(false);}};
  return <div className={css.page}>
    <div className={css.intro}><span>THE LUNCH CLUB · COLLECTION 02</span><h2>A little strange.<br/>A lot of character.</h2><p>Collect a favourite. Give it a place in your restaurant.</p></div>
    <nav className={css.tabs} aria-label="Pack type">{(['regular','super'] as const).map(id=><button key={id} aria-pressed={pack===id} disabled={opening} onClick={()=>{setPack(id);setRevealed(null);}}>{PACKS[id].name}<small>{usdcLabel(PACKS[id].priceUnits)} USDC at launch</small></button>)}</nav>
    <section className={css.hero} data-pack={pack}>
      <div className={css.packArt} data-opening={opening}><div className={css.ring}/><ModelIcon kind={items[pack==='regular'?0:1].id} label={items[pack==='regular'?0:1].name} size={200}/><span>{pack==='regular'?'LITTLE LEGENDS':'AFTER HOURS'}</span></div>
      <div><span className={css.eyebrow}>12 placeable collectibles · one item per pack</span><h3>{spec.name}</h3><p>{spec.subtitle}</p><p className={css.launchPrice}>Proposed pack price <strong>{usdcLabel(spec.priceUnits)} USDC</strong></p><p className={css.note}>Future domain packs use token-backed NFTs. Keep and place the collectible, or redeem its published token backing under the confirmed fee terms. No fixed USDC return is promised.</p>
      {preview?<button className={css.primary} disabled={opening||!!state.run||!!state.rally.service} onClick={open}>{opening?'Unwrapping…':'Try a free beta pack'}</button>:<p className={css.notice}>Paid packs are not open yet.</p>}
      <p className={css.note}>{preview?'Beta samples use no money, mint no NFT and will be wiped at launch. They do not count on the leaderboard.':'Purchases, minting and redemption remain closed until the separate settlement integration is verified.'}</p></div>
    </section>
    {revealed&&<section className={css.reveal} data-rarity={revealed.rarity} role="status"><ModelIcon kind={revealed.id} label={revealed.name} size={160}/><div><span className={css.eyebrow}>{revealed.rarity} · {oddsLabel(revealed)} · beta sample</span><h3>{revealed.name}</h3><p>{revealed.description}</p><button className={css.primary} onClick={()=>place(revealed.id)}>Find it a home</button><small>Also saved in Decorate → Storage.</small></div></section>}
    <nav className={css.sectionTabs} aria-label="Pack pages"><button aria-pressed={tab==='collection'} onClick={()=>setTab('collection')}>The collection <span>{unique} / 12</span></button><button aria-pressed={tab==='board'} onClick={()=>setTab('board')}>Opening leaderboard</button></nav>
    {tab==='board'?<section className={css.empty}><span>LAUNCH LEADERBOARD</span><h3>The first page is still unwritten.</h3><p>Verified {pack} pack openings will appear here when paid packs launch. Free beta samples are excluded. Returning or trading an item does not erase its original opening.</p><p className={css.note}>Separate Regular and Super boards · no rarity bonus · equal counts share a rank.</p></section>:<>
      <p className={css.odds}>Every pack has these exact odds. Duplicates are possible; each opening is independent. Decorations and equipment appearances; no cooking or earning advantage.</p>
      <div className={css.grid}>{items.map(item=>{const count=state.decorOwned[item.id]??0,placed=item.equipmentKind?assignedCopies(state,item.id):state.home.layout.filter(p=>p.equipmentId===item.id).length;return <article className={css.card} data-rarity={item.rarity} key={item.id}><div className={css.itemArt}><ModelIcon kind={item.id} label={item.name} size={150}/><span>{oddsLabel(item)}</span></div><div className={css.body}><span className={css.eyebrow}>{item.rarity} · {item.equipmentKind?'Equipment appearance':item.mount==='counter'?'Countertop':item.mount}</span><h4>{item.name}</h4><p>{item.description}</p><small>{count?`${count} owned · ${placed} placed`:'Not collected yet'}</small>{count>placed&&<button onClick={()=>place(item.id)}>{item.equipmentKind?'Apply to equipment':'Place from storage'}</button>}</div></article>;})}</div>
    </>}
  </div>;
}

"use client";
import {useState} from 'react';
import {createDiner,dispatchDiner,type DinerCommand} from '@/lib/chef/diner/progression';
import {PACKS,packItems,oddsLabel,usdcLabel,type PackKind} from '@/lib/chef/diner/collectible-packs';
import {CollectiblePacks} from '../diner-preview/CollectiblePacks';
import {GroupArrange} from '../diner-preview/GroupArrange';
import {RoomStyleStudio} from '../diner-preview/RoomStyleStudio';
import {appearanceTargets} from '@/lib/chef/diner/collectible-appearances';
import {createPlacementDraft,previewPlacement} from '../diner-preview/placement-preview';
import {ModelIcon} from '../diner-preview/ModelIcon';
import css from '../diner-preview/diner.module.css';

/** Isolated UX fixture: no wallet account, API purchase, NFT or browser save.
 * Replace simulated settlement only after the separate financial release gate. */
export default function CollectorEntrance({fixture}:{fixture:true}){
 const [state,setState]=useState(()=>createDiner(1800000000000,'private-collector-fixture')),[pack,setPack]=useState<PackKind>('regular'),[tab,setTab]=useState<'packs'|'collection'|'board'>('packs'),[room,setRoom]=useState(false),[revealed,setRevealed]=useState<string|null>(null),[message,setMessage]=useState('');
 const send=(c:DinerCommand)=>{const result=dispatchDiner(state,c,{now:state.updatedAt});if(result.error){setMessage(result.error);return false;}setState(result.state);return true;};
 const place=(id:string)=>{const item=packItems('regular').concat(packItems('super')).find(i=>i.id===id)!;
  if(item.equipmentKind){const target=appearanceTargets(state,'home').find(t=>t.kind===item.equipmentKind);if(!target){setMessage(`Own and place a compatible ${item.equipmentKind} first. The collectible stays in your collection.`);return;}if(!send({type:'setCollectibleAppearance',location:'home',targetId:target.id,skinId:id}))return;}
  else{const p=previewPlacement(state,createPlacementDraft(state,'home',id,`fixture-${id}`));if(p.error){setMessage('This piece is stored until you make room for it.');}else send(p.command);}
  setRoom(true);
 };
 const simulate=()=>{const item=packItems(pack)[0];setState(s=>({...s,decorOwned:{...s.decorOwned,[item.id]:(s.decorOwned[item.id]??0)+1}}));setRevealed(item.id);};
 return <main className={css.game} style={{height:'auto',minHeight:'100dvh',padding:'32px max(16px,5vw)'}}><p className={css.notice}>Private collector entrance fixture · simulated ownership only · no payments, NFT minting or redemption</p><h1>Collect it. Place it. Make it yours.</h1><nav className={css.actions}>{(['packs','collection','board'] as const).map(t=><button key={t} className={css.button} onClick={()=>setTab(t)}>{t==='board'?'Opening leaderboard':t==='collection'?'View collection':'Browse packs'}</button>)}</nav>
 {tab==='packs'?<><div className={css.tabs}>{(['regular','super'] as const).map(k=><button className={css.button} key={k} onClick={()=>setPack(k)} aria-pressed={pack===k}>{PACKS[k].name}</button>)}</div><h2>{PACKS[pack].name} · {usdcLabel(PACKS[pack].priceUnits)} USDC proposed</h2><p>Legacy collection preview. Future domain packs use token-backed NFTs. Redeeming returns the published backing token amount under the confirmed fee terms, not a fixed USDC amount. Purchases and redemption remain closed.</p><div className={css.grid}>{packItems(pack).map(item=><article className={css.card} key={item.id}><ModelIcon kind={item.id} label={item.name} size={130}/><h3>{item.name}</h3><p>{item.rarity} · {oddsLabel(item)}</p><p>{item.description}</p></article>)}</div><p>Browsing needs no cooking tutorial. Wallet authentication will be requested for account actions. All items are cosmetic.</p><button className={css.primary} onClick={simulate}>Developer fixture: simulate a settled item</button>{revealed&&<div className={css.actions}><button className={css.primary} onClick={()=>place(revealed)}>Place in restaurant</button><button className={css.button} onClick={()=>setTab('collection')}>View collection</button><button className={css.button} onClick={()=>setTab('board')}>Opening leaderboard</button></div>}</>:tab==='collection'?<CollectiblePacks state={state} send={send} place={place} preview={false}/>:<><h2>Verified pack openings</h2><p>Regular and Super rankings are separate. This private preview has no real purchases or rankings.</p><div className={css.tabs}>{(['regular','super'] as const).map(k=><button className={css.button} key={k} onClick={()=>setPack(k)}>{PACKS[k].name} rankings</button>)}</div><p>No verified {pack} openings. Cooking scores never count here.</p></>}
 {message&&<p role="status" className={css.notice}>{message}</p>}{room&&<GroupArrange state={state} send={send} close={()=>setRoom(false)}/>}</main>;
}

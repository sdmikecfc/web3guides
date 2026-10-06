'use client';
import {useState,type CSSProperties} from 'react';
import dynamic from 'next/dynamic';
import {DOMAIN_IDS,DOMAIN_WORLDS,domainPackItems,DOMAIN_PACK_PRICES,DOMAIN_PACK_MILESTONES,DOMAIN_REDEMPTION_COPY,type DomainId} from '@/lib/chef/diner/domain-worlds';
import type {PackKind} from '@/lib/chef/diner/collectible-packs-v1';
import {DOMAIN_COLLECTION_UNLOCK_COPY} from '@/lib/chef/diner/domain-discoveries';
import {hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
import {experiencePackItems} from '@/lib/chef/diner/pack-experience';
import css from './domain-hub.module.css';
const RoomReview=dynamic(()=>import('../domain-review/DomainRoomReview'),{ssr:false,loading:()=> <p>Opening the room…</p>});
export default function DomainHub({initialDomain,review}:{initialDomain?:DomainId;review:boolean}){
  const [domain,setDomain]=useState<DomainId|undefined>(initialDomain),[tab,setTab]=useState<'packs'|'journey'|'leaderboard'>('packs'),[pack,setPack]=useState<PackKind>('regular'),[showRoom,setShowRoom]=useState(!!initialDomain);
  const world=domain?DOMAIN_WORLDS[domain]:null;
  const style=world?{'--ink':world.palette.ink,'--paper':world.palette.paper,'--accent':world.palette.accent,'--secondary':world.palette.secondary} as CSSProperties:{};
  return <main className={css.page} style={style}>
    <header className={css.header}><a href="/chef/diner-preview">DOMAIN KITCHEN</a><a href="/chef/pack-review">Try the pack opening ↗</a><span>PRIVATE CONCEPT REVIEW · PACKS CLOSED</span></header>
    {!domain||!world?<>
      <section className={css.intro}><span className={css.eyebrow}>THREE WORLDS WORTH COLLECTING</span><h1>Make room for<br/>the extraordinary.</h1><p>Three cuisines. Three journeys. Little worlds to make your restaurant yours.</p></section>
      <div className={css.worlds}>{DOMAIN_IDS.map((id,i)=>{const w=DOMAIN_WORLDS[id];return <button key={id} className={css.worldCard} style={{'--accent':w.palette.accent,'--ink':w.palette.ink,'--secondary':w.palette.secondary} as CSSProperties} onClick={()=>{setDomain(id);setShowRoom(true);}}><div className={css.worldArt} aria-hidden="true"><span>{['G','S','W'][i]}</span><div className={css.arch}/><small>WORLD 0{i+1}</small></div><div className={css.worldCopy}><small>{w.name}</small><h2>{w.room}</h2><p>{w.invitation}</p><span>Explore the world ↗</span></div></button>;})}</div>
      <p className={css.note}>Original art studies and proposed experiences. No purchases, live rankings or season dates are active.</p>
    </>:<>
      <button className={css.back} onClick={()=>{setDomain(undefined);setShowRoom(false);}}>← All three worlds</button>
      <section className={css.domainIntro}><div><span className={css.eyebrow}>{world.name}</span><h1>{world.room}</h1><p>{world.invitation}</p></div><button onClick={()=>setShowRoom(!showRoom)}>{showRoom?'Hide room studies':'View room & hero studies'}</button></section>
      {showRoom&&review&&<RoomReview key={domain} domain={domain}/>}
      <nav className={css.tabs} aria-label="Explore this domain">{(['packs','journey','leaderboard'] as const).map(t=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>setTab(t)}>{t==='packs'?'Packs':t==='journey'?'Free journey':'Leaderboard'}</button>)}</nav>
      {tab==='packs'?<section>
        <div className={css.packHeading}><div><h2>A collection with a place at home.</h2><p>12 Regular. 12 Super. Every pull is cosmetic.</p></div><div className={css.switcher}>{(['regular','super'] as const).map(p=><button aria-pressed={pack===p} key={p} onClick={()=>setPack(p)}>{p==='regular'?'Regular':'Super'} · {DOMAIN_PACK_PRICES[p]/1e6} USDC*</button>)}</div></div>
        <div className={css.terms}><strong>Complete the collection. Unlock the restaurant.</strong><p>{DOMAIN_COLLECTION_UNLOCK_COPY}</p><p>Duplicates do not advance the collection. Progress carries across seasons for this collection. Your room unlock stays yours.</p></div>
        <div className={css.catalogue}>{experiencePackItems(domain,pack).map((item,i)=><article className={css.item} key={item.id}><div className={css.itemTop}><span>{String(i+1).padStart(2,'0')}</span><small>{item.rarity} · {item.weight/100}%</small></div><h3>{item.name}</h3><p>{item.description}</p><footer>{item.machine?`${item.machine.replaceAll('_',' ')} appearance / display`:`${item.mount} decoration`}<span>{hasDomainArtStudy(item.id)?'3D study above':'Concept · not produced'}</span></footer></article>)}</div>
        <details className={css.details}><summary>Odds, duplicates & token backing</summary><p>Proposed base odds v2: four Common at 12% each, four Uncommon at 9% each, Rare 6%, Epic 4%, Legendary 3.5%, Mythic 2.5%. Total: 100% in each pack. Independent openings; duplicates are possible. No pity system.</p><p>{DOMAIN_REDEMPTION_COPY}</p><p>One owned NFT can dress a compatible machine or stand as a decorative, nonfunctional display. Its appearance never improves production or earnings.</p></details>
        <div className={css.terms}><strong>Purchases are closed.</strong><p>*5 / 10 USDC are proposed prices awaiting developer confirmation. Backing amounts, fees, contracts and settlement are not configured.</p></div>
        <p className={css.fine}>Proposed opening milestones: {DOMAIN_PACK_MILESTONES.map(m=>`${m.openings} → ${m.reward.toLowerCase()}`).join(' · ')}. Cosmetic variants never unlock the full restaurant layout.</p>
      </section>:tab==='journey'?<section className={css.journey}>
        <div><span className={css.eyebrow}>EIGHT SERVICES · A FREE COOKING JOURNEY</span><h2>{world.destination}</h2><p>{world.crowd}</p><p>Enter free with the supplied truck, equipment and recipes. An optional Clear & wash helper is available to everyone.</p><a href={`/chef/journey-review?domain=${domain}`}>Play the private journey →</a><p className={css.fine}>Season dates are not announced. This is a preview of the planned journey.</p></div>
        <ol className={css.rewardRoad}>{['Service 2 · '+world.milestones[0],'Service 4 · '+world.milestones[1],'Service 6 · '+world.milestones[2],'Finale · completion badge, recipes & basic kitchen equipment'].map(r=><li key={r}>{r}</li>)}</ol>
        <div className={css.recipeCards}>{world.menu.map(recipe=><article key={recipe.id}><h3>{recipe.name}</h3><p>{recipe.workflow}</p><small>{recipe.equipment}</small></article>)}</div>
        <details className={css.details}><summary>Journey rewards & the collection restaurant</summary><p>The journey earns its badge, recipes, equipment and milestone décor. The complete restaurant unlocks separately by discovering all 24 different domain collectibles at least once.</p><p>The collection restaurant includes one layout for each legitimate restaurant size. Use the layout or just its pieces. Your plot, possessions and selected menu remain yours.</p><p>Free retries. Earned milestones stay owned. Your ordinary trip remains separate. After the season closes, attempts already started have 24 hours to finish.</p></details>
      </section>:<section className={css.board}>
        <h2>{world.name} opening leaderboard</h2><p>Separate boards for Regular and Super. One finalized opening, one count.</p><div className={css.switcher}>{(['regular','super'] as const).map(p=><button key={p} aria-pressed={pack===p} onClick={()=>setPack(p)}>{p==='regular'?'Regular':'Super'}</button>)}</div>
        <div className={css.emptyBoard}><span>SEASON NOT OPEN</span><h3>No verified {pack} openings yet.</h3><p>Dates, funded prizes and distribution rules will be shown when approved.</p></div>
        <p className={css.fine}>Equal totals share a rank. Keeping, redeeming or transferring a pull does not change its opener’s count. Receiving an NFT, beta samples and refunded or invalid requests do not count. Journey progress is separate.</p>
      </section>}
    </>}
    <footer className={css.footer}>Collect it. Place it. Make it yours.<span>Domain Kitchen · private development fixture</span></footer>
  </main>;
}

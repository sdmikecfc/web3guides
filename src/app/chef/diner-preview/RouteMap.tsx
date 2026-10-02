"use client";
import type { CSSProperties } from 'react';
import type { DinerNode, DinerRun, NodeKind } from '@/lib/chef/diner/progression';
import { DinerIcon, type DinerIconName } from './DinerIcon';
import { GameEmblem } from './GameEmblem';
import css from './route-map.module.css';

const stops: Record<NodeKind, { label: string; detail: string; icon: DinerIconName; color: string }> = {
  slow: { label: 'Easy service', detail: 'A gentle lunch. Find your rhythm and earn a little coin.', icon: 'plate', color: '#568577' },
  medium: { label: 'Steady service', detail: 'A few more hungry faces. Prep ahead to stay on top.', icon: 'plate', color: '#568577' },
  busy: { label: 'Busy service', detail: 'A faster rush and a bigger clear bonus. Come prepared.', icon: 'clock', color: '#b7664b' },
  special: { label: 'Special service', detail: 'A different crowd with a twist on the usual lunch.', icon: 'star', color: '#ab7a41' },
  shop: { label: 'Equipment market', detail: 'Spend coins on the recipes and equipment you want.', icon: 'store', color: '#b7664b' },
  ingredients: { label: 'Ingredient stop', detail: 'Pick up ingredients for your permanent recipe upgrades.', icon: 'leaf', color: '#688558' },
  bonus: { label: 'A free gift', detail: 'Choose a little extra for the journey. No service to cook.', icon: 'gift', color: '#b38543' },
  event: { label: 'Roadside encounter', detail: 'Meet someone along the road. See what they have in store.', icon: 'friends', color: '#718f9b' },
  finale: { label: 'The big finish', detail: 'One last, lively service. Bring everything you have learned.', icon: 'star', color: '#b38543' },
};

/** Original paper-cut landmarks, kept light enough for the road to stay readable. */
function StopArt({ kind }: { kind: NodeKind }) {
  const market = kind === 'shop' || kind === 'ingredients';
  return <svg viewBox="0 0 300 126" className={css.art} aria-hidden="true" fill="none" stroke="#57483a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
    <circle cx="246" cy="29" r="15" fill="#f8d87a" stroke="none" />
    <path d="M0 100Q55 43 123 89T300 75V126H0Z" fill="#d9e2c3" stroke="none" />
    <path d="M0 115Q70 79 137 108T300 101V126H0Z" fill="#b9cfb3" stroke="none" />
    <path d="M17 105H286" stroke="#698b72" opacity=".25" />
    {market ? <>
      <path d="M91 49h119v56H91z" fill="#eab779" /><path d="M84 42h133l-13-20H97z" fill="#fff5df" />
      <path d="m105 23-5 17m28-17-2 17m28-17v17m25-17 3 17m17-17 6 17" stroke={kind === 'shop' ? '#bf7054' : '#739273'} strokeWidth="13" />
      <path d="M84 42h133v8q-8 10-16 0-8 10-16 0-8 10-16 0-8 10-16 0-8 10-16 0-8 10-16 0-8 10-16 0-8 10-16 0z" fill="#fff5df" />
      <path d="M101 54h97v29h-97z" fill="#5f7967" /><path d="M86 83h129v10H86z" fill="#fbecd0" />
      {kind === 'ingredients' ? <><circle cx="117" cy="75" r="8" fill="#d77e54" /><circle cx="135" cy="75" r="8" fill="#edb75b" /><path d="m155 82 11-18 9 18m4 0 11-22 7 22" fill="#9eb576" /></> : <><rect x="112" y="64" width="29" height="18" rx="4" fill="#e3e8d5" /><path d="M116 60h20m-25 9h31m34-9v21" /><path d="M161 72q0 13 16 13t15-13z" fill="#eac67d" /></>}
    </> : kind === 'bonus' ? <>
      <path d="M112 55h78v51h-78z" fill="#efc46d" /><path d="M106 46h90v17h-90z" fill="#f5d797" />
      <path d="M145 47h13v59h-13z" fill="#cb785d" /><path d="M151 46q-42-7-23-23 15-10 23 23 8-33 23-23 19 16-23 23" fill="#e79374" />
      <path d="m92 39 2 7m-6-3h10m106 30 2 7m-6-3h10" stroke="#c69b50" />
    </> : kind === 'event' ? <>
      <path d="m73 31 156 8" stroke="#8d8066" /><path d="m82 33 12 13 9-12m14 1 12 13 9-12m14 1 12 13 9-12m14 1 12 13 9-12" fill="#e9b36b" />
      <path d="M124 103V84q0-19 19-19t19 19v19" fill="#6e9b8c" /><circle cx="143" cy="56" r="17" fill="#edbc91" />
      <path d="M127 52q-1-22 17-20t18 23q-14-1-18-12-5 9-17 9" fill="#77503b" />
      <path d="M137 58v1m12-1v1m-10 7q5 4 8 0" /><path d="m179 108-3-24m-3-8q-8-15 2-18 13-1 8 18" fill="#89a478" />
    </> : <>
      <path d="M95 56h89v48H95z" fill="#c97558" /><path d="M184 72h24l20 19v13h-44z" fill="#e7b868" />
      <path d="M191 77h15l11 13h-26z" fill="#b3cfc5" /><path d="M90 54h100l-9-19H99z" fill="#fff6e0" />
      <path d="m107 37-4 15m24-15-2 15m24-15v15m23-15 4 15" stroke="#d07b5d" strokeWidth="10" />
      <rect x="108" y="65" width="57" height="25" rx="2" fill="#4d7869" /><path d="M105 91h62" stroke="#fff0d0" strokeWidth="4" />
      <circle cx="112" cy="106" r="10" fill="#544d43" /><circle cx="209" cy="106" r="10" fill="#544d43" /><circle cx="112" cy="106" r="4" fill="#f4e6c8" /><circle cx="209" cy="106" r="4" fill="#f4e6c8" />
      {(kind === 'busy' || kind === 'finale') && <path d="m60 55 10 8-5 11m-22-13 9 5-4 10" stroke="#cf8a57" strokeWidth="3" />}
      {kind === 'finale' && <path d="m78 19 7 11 13 2-9 9 2 13-13-6-12 6 2-13-10-9 13-2z" fill="#f4cf74" />}
    </>}
    <path d="M48 106V84m-8 7q-14-11-7-19 9-7 14 10m1 10q17-3 16-14-7-9-16 4" fill="#83a27a" stroke="#698b64" />
  </svg>;
}

function branchPreview(run: DinerRun, start: DinerNode): DinerNode[] {
  const path = [start]; let node = start;
  while (node.next.length === 1 && path.length < 4) {
    const next = run.map.find(candidate => candidate.id === node.next[0]);
    if (!next || run.map.filter(candidate => candidate.next.includes(next.id)).length > 1) break;
    path.push(next); node = next;
  }
  return path;
}

export function RouteMap({ run, choose, strikeLimit }: { run: DinerRun; choose: (id: string) => void; strikeLimit: number }) {
  const choices = run.position ? [] : run.available.map(id => run.map.find(node => node.id === id)!).filter(Boolean);
  const reachable = new Set<string>(), pending = [...run.available, ...(run.position ? [run.position] : [])];
  while (pending.length) { const id = pending.pop()!; if (reachable.has(id)) continue; reachable.add(id); pending.push(...(run.map.find(node => node.id === id)?.next ?? [])); }
  const rows = Array.from({ length: 12 }, (_, row) => run.map.filter(node => node.row === row));
  const position = (id: string) => { const node = run.map.find(candidate => candidate.id === id)!; return { x: (node.column + .5) * 1000 / rows[node.row].length, y: node.row * 112 + 48 }; };
  const visited = new Set(run.visited);
  return <div className={css.journey}>
    <div className={css.intro}><GameEmblem kind="cook" size={62} /><div><span className={css.kicker}>Your next little adventure</span><h3>{choices.length > 1 ? 'Which road feels right?' : run.position ? 'Enjoy this stop.' : 'On to the next stop.'}</h3><p>{choices.length > 1 ? 'Pick a road. The other stops wait for another trip.' : 'A little further from home. A little more to bring back.'}</p></div></div>
    <div className={css.choices} data-single={choices.length === 1}>
      {choices.map(node => { const stop = stops[node.kind], preview = branchPreview(run, node); return <article className={css.choice} key={node.id} style={{ '--stop-color': stop.color } as CSSProperties}>
        <div className={css.picture}><StopArt kind={node.kind} /><span className={css.stopNumber}>STOP {node.row + 1}</span></div>
        <div className={css.choiceBody}><span className={css.category}><DinerIcon name={stop.icon} size={16} />{stop.label}</span><h4>{node.name}</h4><p>{stop.detail}</p>
          {choices.length > 1 && preview.length > 1 && <div className={css.preview}><small>ON THIS ROAD</small><ol>{preview.slice(1).map(next => <li key={next.id}><DinerIcon name={stops[next.kind].icon} size={15} /><span>{stops[next.kind].label}</span></li>)}</ol></div>}
          <button className={css.choose} onClick={() => choose(node.id)} aria-label={`Choose ${node.name}, stop ${node.row + 1}`}>{choices.length > 1 ? 'Take this road' : 'Let’s go'}<DinerIcon name="arrow" size={18} /></button>
        </div>
      </article>; })}
    </div>
    <div className={css.risk}><DinerIcon name="heart" size={21} /><p><strong>{Math.max(0, strikeLimit - run.strikes)} of {strikeLimit} chances left.</strong> An upset guest costs one. Lose them all and head home with half your carried coins. Equipment and recipes stay yours.</p></div>
    <details className={css.roadAhead}><summary>See the whole road <span>12 stops · one journey</span><DinerIcon name="arrow" size={17} /></summary>
      <div className={css.map} style={{ height: 1344 }}>
        <svg className={css.roads} viewBox="0 0 1000 1344" preserveAspectRatio="none" aria-hidden="true">{run.map.flatMap(node => node.next.map(id => { const from = position(node.id), to = position(id), taken = visited.has(node.id) && (visited.has(id) || id === run.position || run.available.includes(id)), missed = !reachable.has(id) && !visited.has(id); return <path key={`${node.id}:${id}`} d={`M${from.x},${from.y} C${from.x},${from.y + 55} ${to.x},${to.y - 55} ${to.x},${to.y}`} fill="none" stroke={taken ? '#659381' : missed ? '#e2d8c7' : '#c3cbb0'} strokeWidth={taken ? 8 : 5} strokeDasharray={taken ? undefined : '7 8'} />; }))}</svg>
        {rows.map((nodes, row) => <div className={css.mapRow} key={row}>{nodes.map(node => { const missed = !reachable.has(node.id) && !visited.has(node.id), current = node.id === run.position, available = choices.some(choice => choice.id === node.id); return <div className={css.nodeWrap} key={node.id}><div className={css.node} data-missed={missed} data-visited={visited.has(node.id)} data-current={current || available}><span className={css.nodeIcon} style={{ color: stops[node.kind].color }}><DinerIcon name={visited.has(node.id) ? 'check' : stops[node.kind].icon} size={22} /></span><strong>{node.name}</strong><small>{missed ? 'Road not taken' : visited.has(node.id) ? 'Visited' : current ? 'You are here' : `Stop ${row + 1}${available ? ' · up next' : ''}`}</small></div></div>; })}</div>)}
      </div>
    </details>
  </div>;
}

"use client";
import { COSMETICS, finishPrice, type FinishSlot } from '@/lib/chef/diner/collections';
import type { DinerState } from '@/lib/chef/diner/progression';
import css from './finish-preview.module.css';

export type FinishChoice = { slot: FinishSlot; id: string };
export const FINISH_PREVIEWS: Record<string, {label:string;background:string}> = {
  checker:{label:'Classic checker',background:'repeating-conic-gradient(#739986 0% 25%,#f2ecd6 0% 50%) 0 / 20px 20px'},
  cream:{label:'Warm cream',background:'#ece0c2'},terracotta:{label:'Terracotta tile',background:'#c07f60'},
  mint:{label:'Soft mint',background:'#aac2a7'},rose:{label:'Dusty rose',background:'#c9988b'},
  wood:{label:'Worn oak boards',background:'repeating-linear-gradient(0deg,transparent 0 12px,#715035 12px 14px),repeating-linear-gradient(90deg,#ad8358 0 27px,#a27950 27px 54px,#b88e60 54px 81px)'},
  terrazzo:{label:'Polished terrazzo',background:'radial-gradient(ellipse at 15% 25%,#8d8c80 0 1px,transparent 1.5px) 0 0 / 13px 11px,radial-gradient(ellipse at 70% 65%,#eee9db 0 2px,transparent 2.5px) 0 0 / 19px 17px,#c9c7bb'},
  diner_panel:{label:'Timber panelling',background:'linear-gradient(0deg,#785638 0 40%,#b8945e 40% 44%,transparent 44%),repeating-linear-gradient(90deg,#bbab8d 0 25px,#a5987d 25px 27px)'},
  deco:{label:'Art-deco walls',background:'repeating-linear-gradient(90deg,transparent 0 24px,#b39862 24px 26px),linear-gradient(0deg,#254943 0 27%,#b39862 27% 30%,#41665d 30%)'},
};
const label = (value: string) => FINISH_PREVIEWS[value]?.label??value.replaceAll('_',' ');
export function FinishPreview({ state, choice, change, cancel, apply }: { state: DinerState; choice: FinishChoice; change: (choice: FinishChoice) => void; cancel: () => void; apply: () => void }) {
  const owned = state.finishOwned[choice.slot].includes(choice.id), price = finishPrice(choice.slot, choice.id) ?? 0, applied = state.cosmetics[choice.slot] === choice.id;
  return <section className={css.panel} aria-label="Preview room colors">
    <div className={css.heading}><div><strong>Try it in your room</strong><small>Preview only · nothing spent yet</small></div><button aria-label="Cancel color preview" onClick={cancel}>×</button></div>
    <div className={css.row} style={{flexWrap:'wrap'}}><div className={css.tabs} role="group" aria-label="Finish surface">{(['floor', 'wall'] as const).map(slot => <button key={slot} aria-pressed={choice.slot === slot} onClick={() => change({ slot, id: state.cosmetics[slot] })}>{slot === 'floor' ? 'Floor' : 'Walls'}</button>)}</div><div className={css.swatches} style={{flexWrap:'wrap',flex:'1 1 300px'}}>{(choice.slot === 'floor' ? COSMETICS.floors : COSMETICS.walls).map(id => <button key={id} aria-label={`Preview ${label(id)} ${choice.slot}`} aria-pressed={choice.id === id} title={label(id)} onClick={() => change({ ...choice, id })}><span style={{ background: FINISH_PREVIEWS[id]?.background }} />{label(id)}</button>)}</div></div>
    <div className={css.footer}><span>{label(choice.id)} · {owned ? 'Owned' : `${price} coins`}</span><button className={css.cancel} onClick={cancel}>Cancel</button><button className={css.apply} disabled={applied || (!owned && state.coins < price)} onClick={apply}>{applied ? 'Already applied' : owned ? 'Apply finish' : `Buy & apply · ${price}`}</button></div>
    {!owned && state.coins < price && <p className={css.error}>You need {price - Math.floor(state.coins)} more coins. The preview is free.</p>}
  </section>;
}

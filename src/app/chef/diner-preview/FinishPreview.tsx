"use client";
import { COSMETICS, finishPrice, type FinishSlot } from '@/lib/chef/diner/collections';
import type { DinerState } from '@/lib/chef/diner/progression';
import css from './finish-preview.module.css';

export type FinishChoice = { slot: FinishSlot; id: string };
const colors: Record<string, string> = { checker: 'linear-gradient(135deg,#739986 50%,#f2ecd6 50%)', cream: '#ece0c2', terracotta: '#c07f60', mint: '#aac2a7', rose: '#c9988b' };
const label = (value: string) => value[0].toUpperCase() + value.slice(1);
export function FinishPreview({ state, choice, change, cancel, apply }: { state: DinerState; choice: FinishChoice; change: (choice: FinishChoice) => void; cancel: () => void; apply: () => void }) {
  const owned = state.finishOwned[choice.slot].includes(choice.id), price = finishPrice(choice.slot, choice.id) ?? 0, applied = state.cosmetics[choice.slot] === choice.id;
  return <section className={css.panel} aria-label="Preview room colors">
    <div className={css.heading}><div><strong>Try it in your room</strong><small>Preview only · nothing spent yet</small></div><button aria-label="Cancel color preview" onClick={cancel}>×</button></div>
    <div className={css.row}><div className={css.tabs} role="group" aria-label="Finish surface">{(['floor', 'wall'] as const).map(slot => <button key={slot} aria-pressed={choice.slot === slot} onClick={() => change({ slot, id: state.cosmetics[slot] })}>{slot === 'floor' ? 'Floor' : 'Walls'}</button>)}</div><div className={css.swatches}>{(choice.slot === 'floor' ? COSMETICS.floors : COSMETICS.walls).map(id => <button key={id} aria-label={`Preview ${id} ${choice.slot}`} aria-pressed={choice.id === id} title={label(id)} onClick={() => change({ ...choice, id })}><span style={{ background: colors[id] }} />{label(id)}</button>)}</div></div>
    <div className={css.footer}><span>{label(choice.id)} · {owned ? 'Owned' : `${price} coins`}</span><button className={css.cancel} onClick={cancel}>Cancel</button><button className={css.apply} disabled={applied || (!owned && state.coins < price)} onClick={apply}>{applied ? 'Already applied' : owned ? 'Apply finish' : `Buy & apply · ${price}`}</button></div>
    {!owned && state.coins < price && <p className={css.error}>You need {price - Math.floor(state.coins)} more coins. The preview is free.</p>}
  </section>;
}

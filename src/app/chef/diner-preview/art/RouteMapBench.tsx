"use client";
import { useState } from 'react';
import { createDiner, dispatchDiner, type DinerRun } from '@/lib/chef/diner/progression';
import { RouteMap } from '../RouteMap';

/** Visual fixture only; the parent route is unavailable outside development. */
export function RouteMapBench() {
  const [run, setRun] = useState<DinerRun>(() => {
    const state = createDiner(1_800_000_000_000, 'road-art-bench');
    state.tutorial.finished = true;
    const result = dispatchDiner(state, { type: 'startRun', routeId: 'downtown' }, { now: state.updatedAt });
    const route = result.state.run!;
    return { ...route, visited: ['r0c0', 'r1c0'], available: ['r2c0', 'r2c1'], haul: 240 };
  });
  return <section aria-label="Route map art preview" style={{ maxWidth: 780, margin: '32px auto', background: '#fff8e9', borderRadius: 24, padding: 20 }}>
    <p style={{ fontSize: 12 }}>Route artwork preview. These choices do not change a restaurant save.</p>
    <RouteMap run={run} strikeLimit={3} choose={id => setRun(current => ({ ...current, visited: [...current.visited, id], available: current.map.find(node => node.id === id)!.next }))} />
  </section>;
}

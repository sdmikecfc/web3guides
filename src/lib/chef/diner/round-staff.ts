import type { DinerState } from './progression';
import type { ServiceHelperConfig, ServiceState } from './types';

export const ROUND_HELPER_ROLES = ['runner', 'washer', 'prep'] as const;
export type RoundHelperRole = typeof ROUND_HELPER_ROLES[number];
export const ROUND_HELPER_LABELS: Record<RoundHelperRole, string> = {
  runner: 'Serve', washer: 'Clear & wash', prep: 'Help prepare',
};
export function roundHelperCapacity(state: Pick<DinerState, 'career' | 'truckTier'>): number {
  return state.truckTier >= 2 ? 2 : state.career.services >= 1 ? 1 : 0;
}
export function roundHelpers(state: DinerState): ServiceHelperConfig[] {
  return (state.truckConfig.roundHelpers ?? []).slice(0, roundHelperCapacity(state)).map((role, i) => ({
    id: `round-helper-${i + 1}`, role, look: i === 0 ? 3 : 6,
    name: i === 0 ? 'Robin' : 'Sam', outfit: 'classic',
  }));
}
/** Cumulative rounding makes command batching and reloads pay the same wage. */
export function serviceWages(service: Pick<ServiceState, 'config' | 'coins'>): number {
  return service.config.wageVersion === 1 && !service.config.practice
    ? Math.floor(service.coins * service.config.helpers.length / 5) : 0;
}
export function serviceNet(service: Pick<ServiceState, 'config' | 'coins'>): number {
  return service.coins - serviceWages(service);
}

export type ServiceReceipt={food:number;tips:number;wages:number;bonus:number;net:number;served:number;missed:number};
export function serviceReceipt(service:ServiceState,bonus=0):ServiceReceipt {
 const tips=service.stats?.tips??service.customers.filter(c=>c.payment&&c.phase!=='eating').reduce((n,c)=>n+c.tip,0);
 return {food:service.coins-tips,tips,wages:serviceWages(service),bonus,net:serviceNet(service)+bonus,served:service.served,missed:service.missed};
}

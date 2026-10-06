/** Paid settlement is a separate, unshipped integration. A client flag or URL
 * parameter must never open sales while that prerequisite is missing. */
export const PACK_SETTLEMENT_READY=false;
export function publicPacksEnabled(env:Record<string,string|undefined>){return env.DINER_PACKS_RELEASE==='true'&&PACK_SETTLEMENT_READY;}
export function privatePackFixtureEnabled(env:Record<string,string|undefined>){return env.NODE_ENV==='development'&&env.DINER_PACKS_FIXTURE==='true';}

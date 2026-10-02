/** Disposable browser progress, never credentials or an authoritative account. */
export const BETA_RESET_NOTICE = 'All beta data and progress will be wiped for the official launch.';
export const BETA_SAVE_NOTICE = 'Progress is saved in this browser for your connected wallet. It does not sync between devices.';

export function betaWallet(address: string | undefined, connected: boolean): string | null {
  return connected && address && /^0x[0-9a-f]{40}$/i.test(address) ? address.toLowerCase() : null;
}

export function betaStorageKeys(wallet: string) {
  const normalized = betaWallet(wallet, true);
  if (!normalized) throw new Error('Connect a wallet before opening the beta.');
  const namespace = `domain_kitchen_beta_v1:${normalized}`;
  return { save: `${namespace}:save`, preferences: `${namespace}:preferences` };
}

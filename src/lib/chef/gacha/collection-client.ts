import type { DomainId } from '../diner/domain-worlds';
import type { DinerState } from '../diner/progression';
import { attachVerifiedCollectionRoom } from './room-reward';

/** A narrowly scoped beta bridge: no cloud save adoption and no submitted state.
 * Read the current state AFTER the request so intervening play is never lost. */
export async function claimCollectionRestaurant(options: {
  wallet: string; domain: DomainId; session: { wallet?: string; accessToken: string }; signal: AbortSignal;
  current(): { wallet: string; state: DinerState } | null;
  persist(next: DinerState): void;
  fetcher?: typeof fetch;
}) {
  const { wallet, domain, session, signal } = options;
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || session.wallet?.toLowerCase() !== wallet || options.current()?.wallet !== wallet || signal.aborted) throw new Error('Open the beta restaurant for this wallet first.');
  const response = await (options.fetcher ?? fetch)(`/api/chef/gacha/${domain}/room`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: '{}', cache: 'no-store', signal });
  if (!response.ok) throw new Error(response.status === 409 ? 'Discover all 24 different pieces before claiming this restaurant.' : response.status === 401 ? 'Sign in again to check this wallet.' : 'The restaurant reward could not be verified. You can retry.');
  const data = await response.json(), current = options.current();
  if (signal.aborted || !current || current.wallet !== wallet) throw new Error('The wallet changed. Open its restaurant to claim again.');
  options.persist(attachVerifiedCollectionRoom(current.state, data.reward, wallet, domain));
}

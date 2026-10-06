import type { DinerState } from '../diner/progression';
import type { DomainId } from '../diner/domain-worlds';
import { equipmentDestinationError, equipmentRoomKey, parseEquipmentInventory, type EquipmentAssignmentRequest, type EquipmentDestination, type EquipmentInventory } from './equipment-ownership';

/** In-memory ownership only; never persist a token, proof or appearance in beta saves. */
export class EquipmentCollectionClient {
  inventory: EquipmentInventory | null = null;
  pending: EquipmentAssignmentRequest | null = null;
  busy = false;
  private disposed = false;
  private sequence = 0;
  private requests = new Set<AbortController>();
  constructor(private ports: {
    domain: DomainId; accessToken: string;
    current(): DinerState | null; changed(inventory: EquipmentInventory | null): void;
    fetcher?: typeof fetch; requestId?: () => string;
  }) {}
  clear() { this.inventory = null; this.ports.changed(null); }
  dispose() { this.disposed = true; this.sequence++; this.requests.forEach(c => c.abort()); this.requests.clear(); this.clear(); }
  private async call(body?: EquipmentAssignmentRequest) {
    if (this.disposed || !this.ports.current()) throw new Error('Reconnect this restaurant’s wallet.');
    const sequence = ++this.sequence, controller = new AbortController(); this.requests.add(controller);
    try {
      const response = await (this.ports.fetcher ?? fetch)(`/api/chef/gacha/${this.ports.domain}/equipment`, {
        method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.ports.accessToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        if (body && [400, 401, 409].includes(response.status)) this.pending = null;
        throw new Error(response.status === 401 ? 'Sign in again to check ownership.' : response.status === 409 ? 'Ownership or another appearance changed. Refresh and choose again.' : 'Could not check ownership. Your restaurant is unchanged.');
      }
      const value = await response.json();
      if (this.disposed || sequence !== this.sequence || !this.ports.current()) return;
      if (value.source !== 'finalized-ownership') throw new Error('A verified ownership record is required.');
      const inventory = parseEquipmentInventory(value.inventory, this.ports.domain);
      if (body) this.pending = null;
      this.inventory = inventory; this.ports.changed(inventory);
    } catch (error) { if (!this.disposed && sequence === this.sequence) this.clear(); throw error; }
    finally { this.requests.delete(controller); }
  }
  async refresh() { if (!this.busy) await this.call(); }
  async assign(tokenId: string, destination: EquipmentDestination | null) {
    if (this.busy) return;
    if (this.pending) throw new Error('Retry the unfinished change first.');
    const state = this.ports.current(), item = this.inventory?.items.find(i => i.tokenId === tokenId);
    if (!state || !item || !this.inventory?.ready) throw new Error('Refresh your owned collection first.');
    if (destination) { const error = equipmentDestinationError(state, item.itemId, destination); if (error) throw new Error(error); }
    this.pending = { tokenId, destination, revision: this.inventory.revision, requestId: (this.ports.requestId ?? (() => crypto.randomUUID()))() };
    await this.retry();
  }
  async retry() {
    if (this.busy || !this.pending) return;
    this.busy = true;
    try { await this.call(this.pending); } finally { this.busy = false; }
  }
  /** Storage/replacement releases only this save's binding, never another room's. */
  async releaseMissing() {
    if (this.busy || this.pending) return;
    const state = this.ports.current(); if (!state || !this.inventory?.ready) return;
    const missing = this.inventory.items.find(i => i.destination?.room === equipmentRoomKey(state) && equipmentDestinationError(state, i.itemId, i.destination));
    if (missing) await this.assign(missing.tokenId, null);
  }
}

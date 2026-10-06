import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoundSecretStore } from './operations';
import { bareHash } from './protocol';

const referencePattern = /^dk-vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Server-only, service-role Vault adapter. No credentials are loaded here.
 * Reads are restricted to this game's committed round references by the RPC;
 * arbitrary Vault IDs and uncommitted reservations cannot be decrypted. */
export class SupabaseRoundSecrets implements RoundSecretStore {
  constructor(private readonly db: SupabaseClient) {}
  async createOnce(key: string) {
    if (!/^domain-kitchen:[1-9][0-9]*:0x[0-9a-f]{40}:round:[0-9]+$/.test(key) || key.length > 240) throw new Error('Invalid secret operation');
    try {
      const result = await this.db.rpc('diner_gacha_secret_create', { p_key: key, p_candidate: randomBytes(32).toString('hex') });
      if (result.error || !referencePattern.test(result.data?.reference)) throw new Error('unavailable');
      return { reference: String(result.data.reference), hash: bareHash(result.data.hash) };
    } catch { throw new Error('Gacha secret creation unavailable'); }
  }
  async read(reference: string) {
    if (!referencePattern.test(reference)) throw new Error('Invalid secret reference');
    try {
      const result = await this.db.rpc('diner_gacha_secret_read', { p_reference: reference });
      if (result.error) throw new Error('unavailable');
      return bareHash(result.data);
    } catch { throw new Error('Gacha secret read unavailable'); }
  }
}

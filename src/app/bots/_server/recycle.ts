import "server-only";
import { EQUIPMENT_KIND, EQUIPMENT_SOCKETS } from "@/lib/bots/equipment";
import { socketIdsOf, type BotRow, type PartRow } from "./bots";
import { refuse } from "./db";

export interface RecycleReceipt { wallet: string; reason: string; meta: unknown }

/** A paid cleanup may have already deleted some or all parts. Only the exact
 * authoritative receipt for these socket IDs permits that retry. */
export function recyclableParts(bot: BotRow, attached: readonly PartRow[], wallet: string, receipt?: RecycleReceipt | null): PartRow[] {
  if (bot.wallet !== wallet) return refuse(404, "That robot is not in your garage.");
  const sockets = socketIdsOf(bot), ids = new Set(Object.values(sockets).filter((id): id is number => id != null));
  const meta = receipt?.meta && typeof receipt.meta === "object" ? receipt.meta as { parts?: unknown } : null;
  const paidParts = meta?.parts;
  const paidCleanup = !!receipt && receipt.wallet === wallet && receipt.reason === `recycle:${bot.id}` && Array.isArray(paidParts) &&
    paidParts.length === ids.size && new Set(paidParts).size === ids.size && paidParts.every(id => Number.isSafeInteger(id) && ids.has(id));
  if (receipt && !paidCleanup || !paidCleanup && attached.length !== ids.size || new Set(attached.map(p => p.id)).size !== attached.length ||
    attached.some(p => p.wallet !== wallet || p.bot_id !== bot.id || p.recycled_at || !ids.has(p.id)) ||
    EQUIPMENT_SOCKETS.some(s => sockets[s] != null && (attached.some(p => p.id === sockets[s] && p.slot_kind !== EQUIPMENT_KIND[s]) || !paidCleanup && !attached.some(p => p.id === sockets[s])))) {
    return refuse(409, "The fitted parts changed. Refresh your garage before recycling this robot.");
  }
  return [...attached];
}

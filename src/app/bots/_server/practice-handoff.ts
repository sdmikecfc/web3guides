import "server-only";
import { createHash } from "node:crypto";
import { BEGINNER_ORDER, beginnerOffer } from "@/lib/bots/beginner-catalog";
import { EQUIPMENT_KIND } from "@/lib/bots/equipment";
import { nameText } from "@/lib/bots/fixtures";
import { findsOf, normalizeLook } from "@/lib/bots/look";
import { parsePracticeAppearance, parsePracticeDraft, type PracticeAppearance } from "@/lib/bots/practice-handoff";
import { isPaintId } from "../_engine/parts";
import { missingMigration } from "./rollout";
import { STARTER_PARTS } from "../_engine/catalog";
import { buildJsonOf, earnedOf, loadBots, loadParts, socketIdsOf, type BotRow, type PartRow } from "./bots";
import { dayKey, nowIso, refuse, type BotsDb } from "./db";
import { loadOnboarding, mutateOnboarding, onboardingView } from "./onboarding";

export function isUnusedStarter(bot: BotRow, parts: readonly PartRow[]): boolean {
  const ids = socketIdsOf(bot);
  return !buildJsonOf(bot).practiceImported && bot.level === 1 && bot.xp === 0 && bot.wins === 0 && bot.losses === 0 &&
    !bot.broken_until && bot.attacks_today === 0 && bot.defenses_today === 0 && new Set(Object.values(ids)).size === 7 &&
    BEGINNER_ORDER.every(socket => parts.some(p => p.id === ids[socket] && p.wallet === bot.wallet && p.bot_id === bot.id && p.slot_kind === EQUIPMENT_KIND[socket] && !p.recycled_at && p.source === "starter" &&
      (STARTER_PARTS.some(c => c.id === p.part_key && c.slot === p.slot_kind) || !!beginnerOffer(p.part_key))));
}

function appearanceFingerprint(appearance: PracticeAppearance): string {
  const look = appearance.look;
  return createHash("sha256").update(JSON.stringify({
    offers: BEGINNER_ORDER.map(s => appearance.offers[s]), paints: BEGINNER_ORDER.map(s => appearance.paints?.[s] ?? null), name: appearance.name,
    look: look ? { face: look.face, sticker: look.sticker, spot: look.spot, stickerPaint: look.stickerPaint, hat: look.hat } : null,
  })).digest("hex");
}

/** Claim before changing any part. Same-payload retries can finish a partial write;
 * a competing payload cannot touch even the first part. */
async function claimAppearance(db: BotsDb, target: BotRow, fingerprint: string): Promise<BotRow> {
  const current = buildJsonOf(target).practiceHandoff;
  if (current) {
    if (current.fingerprint !== fingerprint) return refuse(409, "This robot already has a different saved appearance. Your practice robot is still saved in this browser.");
    return target;
  }
  const stamp = nowIso(), build = { ...buildJsonOf(target), practiceHandoff: { fingerprint, status: "pending" as const } };
  const { data, error } = await db.from("battle_bots_bots").update({ build, updated_at: stamp }).eq("id", target.id).eq("wallet", target.wallet).eq("updated_at", target.updated_at).select("id");
  if (error) throw new Error(`practice appearance claim: ${error.message}`);
  if (data?.length) return { ...target, build, updated_at: stamp };
  const fresh = (await loadBots(db, target.wallet)).find(b => b.id === target.id);
  if (fresh && buildJsonOf(fresh).practiceHandoff?.fingerprint === fingerprint) return fresh;
  return refuse(409, "Your garage changed. Refresh it before continuing.");
}

export async function carryPracticeAppearance(db: BotsDb, wallet: string, raw: unknown) {
  const progressBefore = await loadOnboarding(db, wallet);
  if (progressBefore?.version === 2) {
    const draft = parsePracticeDraft(raw) ?? (() => {
      const full = parsePracticeAppearance(raw);
      return full ? parsePracticeDraft({ ...full, version: 2, complete: true }) : null;
    })();
    if (!draft) return refuse(400, "This browser build could not be read. It is still saved here.");
    const selected = BEGINNER_ORDER.map(s => beginnerOffer(draft.offers[s]));
    const paints = BEGINNER_ORDER.filter(s => s !== "weapon").map(s => draft.paints?.[s] ?? beginnerOffer(draft.offers[s])?.color).filter(isPaintId);
    const look = normalizeLook(draft.look, findsOf({ wins: 0, losses: 0, level: 1, champion: false,
      bodyCount: 6, bodyPaints: paints,
      partStars: selected.filter(p => !!p).map(() => 1), hats: [], plateNumber: draft.name.num }));
    const fingerprint = createHash("sha256").update(JSON.stringify({ offers: BEGINNER_ORDER.map(s => draft.offers[s]),
      paints: BEGINNER_ORDER.map(s => draft.paints?.[s] ?? null), name: draft.name, look, complete: draft.complete })).digest("hex");
    const { data, error } = await db.rpc("bb_onboarding_v2_handoff", { p_wallet: wallet, p_offers: draft.offers, p_name: draft.name,
      p_look: look, p_paints: draft.paints ?? {}, p_complete: draft.complete, p_fingerprint: fingerprint });
    if (error && missingMigration(error)) return refuse(503, "The new builder is being set up. Your browser build is safe. Please try again later.");
    if (error?.code === "P0001") return refuse(409, error.message);
    if (error) throw new Error(`starter build transfer: ${error.message}`);
    return data as { applied: boolean; bay?: number; complete?: boolean; reason?: "existing-garage" };
  }
  // Version 2 partial drafts never overwrite an older wallet garage.
  if (raw && typeof raw === "object" && (raw as { version?: unknown }).version === 2) return { applied: false, reason: "existing-garage" as const };
  const appearance = parsePracticeAppearance(raw);
  if (!appearance) return refuse(400, "Choose all seven beginner parts before connecting this build.");
  const fingerprint = appearanceFingerprint(appearance);
  let [bots, parts, progress] = await Promise.all([loadBots(db, wallet), loadParts(db, wallet), loadOnboarding(db, wallet)]);
  let target: BotRow | undefined;
  const existing = progress ? bots.find(b => b.id === progress!.draft_bot_id) : bots.length === 1 ? bots[0] : undefined;
  const prior = existing && buildJsonOf(existing).practiceHandoff;
  if (prior?.fingerprint === fingerprint && prior.status === "complete") return { applied: true, bay: existing!.slot };
  if (prior && prior.fingerprint !== fingerprint) return { applied: false, reason: "existing-garage" as const };
  if (progress) {
    const view = await onboardingView(db, wallet, progress);
    if (progress.completed_at || !view || BEGINNER_ORDER.some(s => view.purchases[s] && view.purchases[s]!.offerId !== appearance.offers[s])) return { applied: false, reason: "existing-garage" as const };
    if (!existing) return refuse(409, "Your first build is not ready yet.");
    await claimAppearance(db, existing, fingerprint);
    await mutateOnboarding(db, wallet, { action: "welcome" }, dayKey());
    for (const socket of BEGINNER_ORDER) if (!view.purchases[socket]) await mutateOnboarding(db, wallet, { action: "buy", socket, offerId: appearance.offers[socket] }, dayKey());
    [bots, parts] = await Promise.all([loadBots(db, wallet), loadParts(db, wallet)]);
    target = bots.find(b => b.id === progress!.draft_bot_id);
  } else {
    // Old-schema accounts keep their real starter economy. Only its unused moulds
    // change, with all stats, prices, IDs, provenance and balances retained.
    if (bots.length !== 1 || !isUnusedStarter(bots[0], parts)) return { applied: false, reason: "existing-garage" as const };
    target = bots[0];
    // Missing fight configuration in older code produced a declined row after
    // releasing its attack. That failed start must not make the starter permanent.
    const { count, error } = await db.from("battle_bots_battles").select("id", { count: "exact", head: true }).neq("status", "declined").or(`challenger_bot_id.eq.${target.id},defender_bot_id.eq.${target.id}`);
    if (error) throw new Error(`practice history read: ${error.message}`);
    if (count) return { applied: false, reason: "existing-garage" as const };
    target = await claimAppearance(db, target, fingerprint);
    if (buildJsonOf(target).practiceHandoff?.status === "complete") return { applied: true, bay: target.slot };
    const ids = socketIdsOf(target);
    for (const socket of BEGINNER_ORDER) {
      const part = parts.find(p => p.id === ids[socket])!, offer = beginnerOffer(appearance.offers[socket])!;
      const paint = appearance.paints?.[socket] ?? offer.color;
      const stats = { ...part.stats, ...(paint ? { paint } : {}) };
      const { data, error: updateError } = await db.from("battle_bots_part_instances").update({ part_key: offer.id, stats, color: paint }).eq("id", part.id).eq("wallet", wallet).eq("bot_id", target.id).eq("source", "starter").is("recycled_at", null).select("id");
      if (updateError) throw new Error(`practice part appearance: ${updateError.message}`);
      if (!data?.length) return refuse(409, "Your garage changed. Refresh it before continuing.");
      part.part_key = offer.id; part.stats = stats;
    }
  }
  if (!target) return refuse(409, "Your first build is not ready yet.");
  const build = { ...buildJsonOf(target), name: appearance.name, practiceImported: true, practiceHandoff: { fingerprint, status: "complete" as const } };
  const updated = { ...target, build };
  build.look = normalizeLook(appearance.look, earnedOf(updated, parts));
  const { data, error } = await db.from("battle_bots_bots").update({ name: nameText(appearance.name), build, updated_at: nowIso() }).eq("id", target.id).eq("wallet", wallet).eq("updated_at", target.updated_at).select("id");
  if (error) throw new Error(`practice appearance save: ${error.message}`);
  if (!data?.length) {
    const fresh = (await loadBots(db, wallet)).find(b => b.id === target!.id);
    if (fresh && buildJsonOf(fresh).practiceHandoff?.fingerprint === fingerprint && buildJsonOf(fresh).practiceHandoff?.status === "complete") return { applied: true, bay: fresh.slot };
    return refuse(409, "Your garage changed. Refresh it before continuing.");
  }
  return { applied: true, bay: target.slot };
}

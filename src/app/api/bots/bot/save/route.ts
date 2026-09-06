/**
 * BATTLE BOTS SAVE A BOT. POST /api/bots/bot/save
 *   { t, bay, name: { first, second, num }, decal?, paint?, parts: { legs,
 *     arms, torso, head, weapon }, listed? }
 *
 * Writes battle_bots_bots for bay 1..5. The name is two words from the
 * fixed tables plus an optional numeral (never free text); the decal is
 * one of the six drawn decals; `paint` is the plate colour, validated as a
 * PaintId (look only; a part's paint is bought through /api/bots/paint).
 * Every part id must be an instance THIS wallet owns, of the right slot,
 * and not on another bot. A sixth bot is refused; an empty or partial
 * bot may be saved (an engine on hooks) but never fights. A whole bot is
 * listed for challenges unless `listed: false` is sent.
 */
import { EQUIPMENT_SOCKETS, EQUIPMENT_KIND, EQUIPMENT_LABEL, type EquipmentIds } from "@/lib/bots/equipment";
import { equipmentStatsTotal, type CombatSocket } from "@/lib/bots/combat-model";
import { NextResponse } from "next/server";
import { DECAL_IDS, FIRST_WORDS, SECOND_WORDS, nameText, type DecalId } from "@/lib/bots/fixtures";
import { LookRefused, parseLook, type BotLookRaw } from "@/lib/bots/look";
import { STRINGS } from "@/lib/bots/strings";
import { SLOTS, botTier, isPaintId, type PaintId, type Slot, type Stats } from "@/app/bots/_engine/parts";
import { weightClassOf } from "@/app/bots/_engine/rewards";
import {
  BAY_MAX,
  BAY_MIN,
  DEFAULT_BOT_PAINT,
  botView,
  earnedFor,
  loadBots,
  loadCrownBotIds,
  loadHats,
  loadParts,
  partStats,
  type BuildJson,
} from "@/app/bots/_server/bots";
import { botsDb, dayKey, failResponse, intIn, nowIso, readJson, refuse } from "@/app/bots/_server/db";
import { loadPlayer } from "@/app/bots/_server/players";
import { sessionFromRequest } from "@/app/bots/_server/session";
import type { BotName } from "@/app/bots/_server/types";

export const runtime = "nodejs";

interface SaveBody {
  t?: string;
  bay?: unknown;
  name?: { first?: unknown; second?: unknown; num?: unknown };
  decal?: unknown;
  paint?: unknown;
  parts?: Partial<Record<Slot, unknown>>;
  sockets?: Partial<Record<keyof EquipmentIds, unknown>>;
  listed?: unknown;
  /** the four things a player picks about the look. Nothing here is trusted:
   * every value is checked against the wallet's own rows below. */
  look?: BotLookRaw;
}

function parseName(v: SaveBody["name"]): BotName {
  const first = v && typeof v.first === "string" && (FIRST_WORDS as readonly string[]).includes(v.first) ? v.first : null;
  const second = v && typeof v.second === "string" && (SECOND_WORDS as readonly string[]).includes(v.second) ? v.second : null;
  if (!first || !second) return refuse(400, "Pick a name from the two word lists.");
  const numRaw = v?.num;
  const num = numRaw == null ? null : intIn(numRaw, 1, 99, "The name number");
  return { first, second, num };
}

export async function POST(req: Request) {
  try {
    const body = await readJson<SaveBody>(req);
    const sess = sessionFromRequest(req, body);
    if (!sess) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });
    const db = botsDb();
    const player = await loadPlayer(db, sess.wallet);
    if (!player) return refuse(401, "Enlist first.");
    const isTest = !!player.is_test;

    const bay = intIn(body.bay, BAY_MIN, BAY_MAX, "The bay");
    const name = parseName(body.name);
    const decal: DecalId | null = typeof body.decal === "string" && (DECAL_IDS as readonly string[]).includes(body.decal) ? (body.decal as DecalId) : null;
    if (body.decal != null && !decal) return refuse(400, "Pick one of the six decals.");
    if (body.paint != null && !isPaintId(body.paint)) return refuse(400, "Pick one of the eight paints.");
    const paint: PaintId = isPaintId(body.paint) ? body.paint : DEFAULT_BOT_PAINT;

    const bots = await loadBots(db, sess.wallet);
    const parts = await loadParts(db, sess.wallet);
    const existing = bots.find((b) => b.slot === bay) ?? null;
    if (!existing && bots.length >= BAY_MAX) return refuse(409, STRINGS.en.garage.full);

    // the build: owned instances of the right slot, not on another bot
    const ids = {} as Record<Slot, number | null>;
    let total = 0;
    let filled = 0;
    const raw = body.parts ?? {};
    for (const slot of SLOTS) {
      const v = raw[slot];
      if (v == null) {
        ids[slot] = null;
        continue;
      }
      const id = intIn(v, 1, Number.MAX_SAFE_INTEGER, `The ${slot} part`);
      const p = parts.find((x) => x.id === id);
      if (!p) return refuse(400, `You do not own that ${slot} part.`);
      if (p.slot_kind !== slot) return refuse(400, `That part is a ${p.slot_kind}, not ${slot}.`);
      if (body.sockets == null && p.stats?.equipmentVersion === 2 && (slot === "arms" || slot === "legs")) {
        return refuse(400, "Pick each arm and leg separately before saving.");
      }
      if (p.bot_id != null && (!existing || p.bot_id !== existing.id)) return refuse(409, `That ${slot} part is on another bot.`);
      ids[slot] = id;
      const s = partStats(p);
      total += s[0] + s[1] + s[2];
      filled += 1;
    }
    let sockets: EquipmentIds<number> | undefined;
    if (body.sockets != null) {
      if (typeof body.sockets !== "object" || Array.isArray(body.sockets)) return refuse(400, "Pick parts for your robot.");
      sockets={} as EquipmentIds<number>; const used=new Set<number>(); const stats={} as Record<CombatSocket,Stats>;
      filled=0; total=0;
      for (const socket of EQUIPMENT_SOCKETS) {
        const raw=body.sockets[socket];
        if (raw == null) { sockets[socket]=null; stats[socket]=[0,0,0]; continue; }
        const id=intIn(raw,1,Number.MAX_SAFE_INTEGER,EQUIPMENT_LABEL[socket]);
        const p=parts.find(p=>p.id===id);
        if (!p || p.slot_kind!==EQUIPMENT_KIND[socket]) return refuse(400, `Pick an owned part for ${EQUIPMENT_LABEL[socket].toLowerCase()}.`);
        if (used.has(id)) return refuse(400,"One part fits one place. Pick a second arm or leg for the other side.");
        if (p.bot_id != null && p.bot_id !== existing?.id) return refuse(409,"That part is on another robot.");
        used.add(id); sockets[socket]=id; stats[socket]=partStats(p); filled++;
      }
      total = equipmentStatsTotal(stats);
      Object.assign(ids,{head:sockets.head,torso:sockets.torso,arms:sockets.armL,legs:sockets.legL,weapon:sockets.weapon});
    }
    const complete = filled === (sockets ? EQUIPMENT_SOCKETS.length : SLOTS.length);
    const listed = complete && body.listed !== false;

    // ── THE LOOK, checked against the rows and nothing else ──────────────
    // The server is the truth (the joint law): a face, a sticker colour and
    // a hat are checked against what this wallet actually owns and earned,
    // and a claim to anything else is refused in plain words rather than
    // quietly stored. What is checked is the robot this request is BUILDING,
    // not the row as it stood a moment ago, so fitting the fourth mint part
    // and picking the wink in one save works. Nothing derived is read out of
    // the request: the plate number is the robot's own name, and no mark can
    // be asked for at all.
    const hats = await loadHats(db, sess.wallet);
    const crowns = await loadCrownBotIds(db, sess.wallet);
    let look;
    try {
      look = parseLook(
        body.look,
        earnedFor(
          {
            wins: existing?.wins ?? 0,
            losses: existing?.losses ?? 0,
            level: existing?.level ?? 1,
            crown: !!existing && crowns.has(existing.id),
            partIds: ids,
            socketIds: sockets,
            plateNumber: name.num,
          },
          parts,
          hats,
        ),
      );
    } catch (e) {
      if (e instanceof LookRefused) return refuse(400, e.message);
      throw e;
    }

    const build: BuildJson = { parts: ids, ...(sockets ? {sockets,equipmentVersion:2 as const} : {}), name, decal, paint, look };
    const row = {
      wallet: sess.wallet,
      slot: bay,
      name: nameText(name),
      build,
      total,
      tier: complete ? botTier(total) : 1,
      weight_class: weightClassOf(total),
      listed,
      is_test: isTest,
      updated_at: nowIso(),
    };

    let botId: number;
    if (existing) {
      const { error } = await db.from("battle_bots_bots").update(row).eq("id", existing.id);
      if (error) throw new Error(`bot update: ${error.message}`);
      botId = existing.id;
    } else {
      const { data, error } = await db.from("battle_bots_bots").insert(row).select("id").single();
      if (error || !data) {
        if (error && /duplicate|unique/i.test(error.message || "")) return refuse(409, `Bay ${bay} is taken.`);
        throw new Error(`bot insert: ${error?.message || "no row"}`);
      }
      botId = Number(data.id);
    }

    // socket the parts: free the ones that left, bind the ones that arrived
    const keep = new Set(Object.values(sockets ?? ids).filter((v): v is number => v != null));
    const leaving = parts.filter((p) => p.bot_id === botId && !keep.has(p.id)).map((p) => p.id);
    if (leaving.length) {
      const { error } = await db.from("battle_bots_part_instances").update({ bot_id: null }).in("id", leaving);
      if (error) throw new Error(`parts free: ${error.message}`);
    }
    if (keep.size) {
      const { error } = await db
        .from("battle_bots_part_instances")
        .update({ bot_id: botId })
        .in("id", Array.from(keep))
        .eq("wallet", sess.wallet);
      if (error) throw new Error(`parts bind: ${error.message}`);
    }

    const fresh = await loadBots(db, sess.wallet);
    const freshParts = await loadParts(db, sess.wallet);
    const bot = fresh.find((b) => b.id === botId);
    if (!bot) throw new Error("the saved bot did not come back");
    const nowMs = Date.now();
    return NextResponse.json({ ok: true, bot: botView(bot, freshParts, dayKey(nowMs), nowMs, { hats, crowns }) });
  } catch (e) {
    return failResponse(e);
  }
}

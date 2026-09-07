/**
 * THE REAL GARAGE: the browser half of GET /api/bots/me, GET
 * /api/bots/paper, POST /api/bots/shop/buy, POST /api/bots/bot/save and
 * POST /api/bots/bot/recycle.
 *
 * WHY THIS FILE EXISTS. The shop and the build screen were reading and
 * WRITING src/lib/bots/garage-state.ts, which is localStorage seeded from the
 * fixture wallet. Four finished routes had no caller, so a signed in player
 * could buy a part, reload, and find their coins back and the part gone. This
 * carries the server's answer to those screens and carries their two actions
 * back. It adds no rule of its own: every refusal a player reads here is the
 * route's own, and every number is the route's own.
 *
 * THE ONE SHAPE, so no screen learns a second one. stateFromMe() turns the
 * server's MeView into the SAME GarageState the demo store hands out, so a
 * screen swaps one object for the other and every read below it (coins, level,
 * owned parts, the saved builds, what was bought today) keeps working. The
 * bridge is one way: nothing here ever writes back into the demo store.
 *
 * THE PART ID IS THE UID. A demo part's uid is "p_003"; a real one is the
 * database row's id, so the uid on the live path is that number as a string.
 * That is the whole trick that lets the build screen post part ids it never
 * had to learn about: Number(uid) IS the instance the save route wants.
 *
 * WHO DECIDES WHICH PATH RUNS:
 *   what is DRAWN  -> the server's answer when it arrived, the demo otherwise;
 *   what is DONE   -> the session token, read fresh at the moment of the tap.
 * They are deliberately not the same test. A player whose token is good but
 * whose /me read failed must still buy on the server, never into a browser.
 *
 * NO CLOCK READS, NO STORE, NO RULES. Plain functions plus one small hook, in
 * the shape of ./earned-client.ts, which this file sits beside.
 */
import { socketsOf, EQUIPMENT_SOCKETS } from "./equipment";
import type { Socket } from "./fixtures";
import { useCallback, useEffect, useState } from "react";
import { readBotsSession } from "@/app/bots/battles/session";
import type { BotView, MeView, PaperView, PartView } from "@/app/bots/_server/types";
import {
  BAY_COUNT,
  CARD_BY_ID,
  CARD_SLOTS,
  type Build,
  type CardSlot,
  type OwnedPart,
} from "./fixtures";
import type { BayState, GarageState } from "./garage-state";
import type { BotLookRaw } from "./look";
import { STRINGS } from "./strings";

const t = STRINGS.en;

/* ── what a route answers ────────────────────────────────────────────────── */

/**
 * An answer from a route, in the shape ./earned-client.ts already uses.
 * `offline` is not a failure: nobody was signed in, so nothing was asked and
 * the caller runs its own demo path and says nothing. A player with no wallet
 * connected has not done anything wrong.
 */
export type ServerSay<T> =
  | { ok: true; value: T }
  | { ok: false; offline: true; message: null }
  | { ok: false; offline?: false; message: string };

/**
 * SENTENCES THAT WERE NOT WRITTEN FOR A PLAYER.
 *
 * Most refusals these routes answer with come straight out of strings.ts and
 * look.ts, which are the two tables scripts/bots-copy-check.ts gates, so
 * showing the route's own words is showing checked copy. A few were written
 * for whoever reads a server log instead, and the giveaway is always a word
 * the copy gate bans on a player surface. A sentence carrying one is dropped
 * for the plain fallback rather than printed.
 */
const OPERATOR_WORDS = /\b(bay|bays|enlist|session|token|wallet)\b/i;

function sentenceOf(status: number, raw: unknown, fallback: string): string {
  if (status === 401) return t.enlist.signedOut;
  if (status >= 500) return fallback;
  const e = typeof raw === "string" ? raw.trim() : "";
  if (!e || OPERATOR_WORDS.test(e)) return fallback;
  return e;
}

async function bodyOf(res: Response): Promise<{ ok?: boolean; error?: unknown } & Record<string, unknown>> {
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return j ?? {};
}

/* ── the three reads and writes ──────────────────────────────────────────── */

/**
 * GET /api/bots/me, or null when this browser has no session, the token has
 * run out, or the route could not answer. Null is "we did not find out", not
 * "this wallet has nothing".
 */
export async function loadMe(): Promise<MeView | null> {
  const token = readBotsSession();
  if (!token) return null;
  try {
    const res = await fetch("/api/bots/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = await bodyOf(res);
    return res.ok && body.ok ? (body as unknown as MeView) : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/bots/shop/buy. The route recomputes today's shelf from the same
 * pure module this screen drew it with, checks "bought today", then the level,
 * then the coins, and answers each one in plain words. Nothing here re-states
 * any of those three rules: they are read off the answer.
 */
export async function buyOnServer(listingId: string): Promise<ServerSay<{ part: PartView; coins: number }>> {
  const token = readBotsSession();
  if (!token) return { ok: false, offline: true, message: null };
  try {
    const res = await fetch("/api/bots/shop/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, listingId }),
    });
    const body = await bodyOf(res);
    if (res.ok && body.ok && body.part) {
      return { ok: true, value: { part: body.part as unknown as PartView, coins: Number(body.coins) || 0 } };
    }
    // a shelf that rolled over at midnight while the page sat open: the parts
    // on screen are yesterday's, so the honest answer is the one the shop
    // already says when a new shipment lands
    if (res.status === 404) return { ok: false, message: t.shopUi.landed };
    return { ok: false, message: sentenceOf(res.status, body.error, t.ui.tryAgain) };
  } catch {
    return { ok: false, message: t.ui.tryAgain };
  }
}

/**
 * GET /api/bots/paper, or null when nobody is signed in, the session ran out
 * or the route could not answer.
 *
 * The paper is the ONE read on this screen that also writes: it drops a zero
 * coin row that marks today as read, so tomorrow's paper knows where to start
 * (_server/paper.ts). Nothing moves, and it is one row per wallet per day, so
 * a second read costs nothing. A null here means the screen keeps the demo
 * paper, which is what a visitor with no wallet has always seen.
 */
export async function loadPaper(): Promise<PaperView | null> {
  const token = readBotsSession();
  if (!token) return null;
  try {
    const res = await fetch("/api/bots/paper", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = await bodyOf(res);
    return res.ok && body.ok ? (body as unknown as PaperView) : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/bots/bot/recycle. One robot, whole: the route pays back part of
 * every card on it through ONE grant keyed to that robot, then deletes the
 * cards and the row, which frees the spot. It is the only place in the game
 * that turns a robot back into coins, and there is no route that does the
 * same for a single loose card, so nothing here pretends there is.
 *
 * `coins` is what this recycle paid; the route answers 0 on a retry that hit
 * the same grant twice, which is the truth about that second press.
 */
export async function recycleBotOnServer(botId: number): Promise<ServerSay<{ coins: number; balance: number; bot: string }>> {
  const token = readBotsSession();
  if (!token) return { ok: false, offline: true, message: null };
  try {
    const res = await fetch("/api/bots/bot/recycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, botId }),
    });
    const body = await bodyOf(res);
    if (res.ok && body.ok) {
      return {
        ok: true,
        value: { coins: Number(body.coins) || 0, balance: Number(body.balance) || 0, bot: String(body.bot ?? "") },
      };
    }
    return { ok: false, message: sentenceOf(res.status, body.error, t.ui.tryAgain) };
  } catch {
    return { ok: false, message: t.ui.tryAgain };
  }
}

/** Everything POST /api/bots/bot/save takes. Spelled out, so a caller cannot
 *  post a field the route would have to think about ignoring. */
export interface SaveBotBody {
  bay: number;
  name: { first: string; second: string; num: number | null };
  decal: string | null;
  /** the plate colour the row already carries. There is no picker for it on
   *  the build screen (ADR-0141), so it is handed straight back rather than
   *  left out, which would reset it to the default on every save. */
  paint?: string;
  /** the owned instance in each socket, or null for an empty one */
  parts: Record<CardSlot, number | null>;
  sockets?: Record<Socket, number | null>;
  listed?: boolean;
  look: BotLookRaw;
}

/**
 * POST /api/bots/bot/save. Every part id is checked against the wallet's own
 * rows, and the look is checked against what the robot BEING BUILT has earned,
 * so a claim that does not hold up comes back as the sentence the player
 * reads.
 */
export async function saveBotOnServer(body: SaveBotBody): Promise<ServerSay<BotView>> {
  const token = readBotsSession();
  if (!token) return { ok: false, offline: true, message: null };
  try {
    const res = await fetch("/api/bots/bot/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, t: token }),
    });
    const answer = await bodyOf(res);
    if (res.ok && answer.ok && answer.bot) return { ok: true, value: answer.bot as unknown as BotView };
    return { ok: false, message: sentenceOf(res.status, answer.error, t.look.notSaved) };
  } catch {
    return { ok: false, message: t.look.notSaved };
  }
}

/* ── the server's answer, in the shape every screen already reads ────────── */

/** One owned card. The catalog fills in what a card IS; the row fills in what
 *  this copy of it is: which instance, where it came from, what colour it
 *  arrived in. The numbers are the row's, never the catalog's, because a
 *  stored part is the truth about itself. */
export function ownedOf(v: PartView): OwnedPart {
  const card = CARD_BY_ID[v.partKey];
  const base = card ?? {
    id: v.partKey,
    slot: v.slot,
    name: v.name,
    tier: v.tier,
    price: v.listPrice,
    lore: v.lore,
    s: v.s,
    familyName: v.familyName,
    design: v.design,
  };
  const p: OwnedPart = {
    ...base,
    s: [v.s[0], v.s[1], v.s[2]],
    tier: v.tier,
    price: v.listPrice,
    salvage: v.salvage,
    uid: String(v.id),
    provenance: v.provenance,
  };
  // the colour a card OWNS and nothing else. The catalog's factory colour is
  // art (ADR-0141 decision 3), and the route already refuses to hand it over
  // as a colour, so this never puts one back.
  if (v.paint) p.paint = v.paint;
  else delete p.paint;
  return p;
}

/** One saved robot, as the build screen's Build. */
export function buildOf(b: BotView): Build {
  const cards = {} as Record<CardSlot, string | null>;
  for (const slot of CARD_SLOTS) {
    const id = b.parts[slot];
    cards[slot] = id == null ? null : String(id);
  }
  return { bay: b.bay, name: b.name, decal: b.decal, cards, look: b.look, ...(b.sockets ? { sockets: Object.fromEntries(EQUIPMENT_SOCKETS.map(s=>[s,b.sockets![s] == null ? null : String(b.sockets![s])])) as Record<Socket,string|null> } : {}) };
}

/**
 * The whole answer, in the demo store's shape. Every screen below this reads
 * one object and never learns there are two paths.
 */
export function stateFromMe(me: MeView): GarageState {
  const bays: Record<number, BayState> = {};
  for (let n = 1; n <= BAY_COUNT; n++) {
    bays[n] = { repairUntil: null, inBattle: false, attacksLeft: 0, wins: 0, losses: 0 };
  }
  const builds: Record<number, Build> = {};
  for (const b of me.bots) {
    builds[b.bay] = buildOf(b);
    bays[b.bay] = {
      repairUntil: b.repairUntil ? Date.parse(b.repairUntil) : null,
      inBattle: false,
      attacksLeft: b.attacksLeft,
      wins: b.wins,
      losses: b.losses,
    };
  }
  return {
    v: 1,
    equipmentVersion: 2,
    coins: me.player.coins,
    level: me.player.level,
    parts: me.parts.map(ownedOf),
    builds,
    bays,
    bought: { [me.day]: me.shop.listings.filter((l) => l.bought).map((l) => l.id) },
    // the demo store hands these two out; neither has a server answer and
    // neither is read on the live path, so nothing is invented for them
    nextUid: 0,
    crew: [],
  };
}

/* ── the two patches, so a tap does not wait on a second round trip ──────── */

/** What the buy route just changed: the coins it charged, the card it made,
 *  and the listing that is now spent for today. */
export function withBoughtPart(me: MeView, listingId: string, part: PartView, coins: number): MeView {
  return {
    ...me,
    player: { ...me.player, coins, spendableCoins: Math.max(0, coins - (me.player.reservedCoins ?? 0)) },
    parts: [...me.parts, part],
    shop: {
      ...me.shop,
      listings: me.shop.listings.map((l) => (l.id === listingId ? { ...l, bought: true } : l)),
    },
  };
}

/** What the save route just changed: the robot in that spot, and which cards
 *  are on it now. A card that left the robot is loose again. */
export function withSavedBot(me: MeView, bot: BotView): MeView {
  const on = new Set(Object.values(bot.sockets ?? bot.parts).filter((v): v is number => v != null));
  return {
    ...me,
    bots: [...me.bots.filter((b) => b.bay !== bot.bay && b.id !== bot.id), bot].sort((a, b) => a.bay - b.bay),
    parts: me.parts.map((p) => {
      if (on.has(p.id)) return p.botId === bot.id ? p : { ...p, botId: bot.id };
      if (p.botId === bot.id) return { ...p, botId: null };
      return p;
    }),
  };
}

/* ── the hook ────────────────────────────────────────────────────────────── */

export interface LiveGarage {
  /** true once the answer has landed, or once we know there is nobody to ask.
   *  A screen must not seed anything off the demo before this turns true, or a
   *  signed in player gets the demo garage for one render and keeps it. */
  ready: boolean;
  /** the server's answer, or null when nobody is signed in or it did not come */
  me: MeView | null;
  /** a session token was in this browser at mount */
  signedIn: boolean;
  refresh: () => Promise<void>;
  /** hand back a patched answer after a buy or a save */
  put: (next: MeView) => void;
}

/**
 * Read the server's garage once, after mount, so the server render and the
 * first client render agree (the same rule the demo store's hydrate follows).
 */
export function useLiveGarage(): LiveGarage {
  const [me, setMe] = useState<MeView | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const refresh = useCallback(async () => {
    const token = readBotsSession();
    setSignedIn(!!token);
    if (!token) {
      setMe(null);
      setReady(true);
      return;
    }
    const v = await loadMe();
    setMe(v);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ready, me, signedIn, refresh, put: setMe };
}

/**
 * THE SHOP DEMO SANDBOX.
 *
 * WHY THIS EXISTS. Mike: "We also need to verify all the shop and upgrade stuff
 * works because I have never seen a demo or anything of buying or even what the
 * buy currency is for vanity stuff or tank upgrades."
 *
 * He was right that he could not have seen it. Every purchase surface needs a
 * play-session token AND a funded, bot-swept wallet, so on a fresh browser the
 * whole economy renders as a wall of "not signed in" and there is no way to
 * watch the loop at all. `?demo=1` gives it to you: a funded commander, the
 * real panels, the real prices, the real disabled-until-you-can-afford-it rules.
 *
 * WHY THIS IS SAFE, which matters because it is a client flag anyone can type.
 *
 *   1. Demo mode carries NO TOKEN. Every write route authenticates on the token
 *      and there isn't one, so a demo purchase cannot reach the database even
 *      if the fetch were somehow issued.
 *   2. It doesn't just skip the write, it skips the REQUEST. isDemo() short
 *      circuits postJson before any network call, so there is no request for a
 *      server bug to mishandle.
 *   3. Balances live in React state and die with the tab.
 *
 * So the worst case is a player convincing their own browser they are rich,
 * seeing cosmetics they do not own, and losing all of it on refresh. Nothing
 * crosses to the server, no leaderboard moves, no Shells are minted. The banner
 * (see DemoBadge) is there so nobody is confused about which they are looking
 * at, not because the state is dangerous.
 */
import type { HqMe } from "@/app/s5/hq/panels";
import { resolveTank, STAT_MILESTONE_TANKS } from "@/lib/s5/model";
import { statNextPrice, type StatKey } from "@/lib/s5/games";
import { TANK_ROSTER, TANK_TIER_PRICES } from "@/lib/s5/tanks";
import { vaultDayNumber, vaultDealForDay } from "@/lib/s5/vault";

/**
 * Read once, at module load. A getter that re-read location on every call would
 * let the flag flip mid-session if anything ever pushed a new URL, and half a
 * demo is worse than none.
 */
let DEMO: boolean | null = null;

export function isDemo(): boolean {
  if (DEMO === null) {
    if (typeof window === "undefined") {
      DEMO = false;
    } else {
      try {
        DEMO = new URLSearchParams(window.location.search).get("demo") === "1";
      } catch {
        DEMO = false;
      }
    }
  }
  return DEMO;
}

/**
 * A commander who can afford EVERYTHING.
 *
 * This started at 420 Shells so the can't-afford path stayed reachable, which
 * was the wrong call for what the sandbox is actually for: the tank ladder runs
 * 300 / 800 / 1,500 / 3,000, so 420 reached exactly one tier-2 hull and Mike
 * could not look at the thing he opened it to look at. Demonstrating the
 * failure state is worth less than being able to browse the shop.
 *
 * The balance still DECREMENTS on every purchase, so the mechanic is visible --
 * it is just large enough that browsing never runs out. The refusal path is
 * still reachable if you buy your way down to it.
 */
export function demoHqMe(): HqMe {
  return {
    session: true,
    // The demo commander has no public garage to link to, so the "see your own
    // card" door stays hidden in the sandbox rather than 404ing.
    handle: null,
    // NOT null, and not a real token either.
    //
    // A null token was the first attempt and it silently broke the whole demo:
    // every buy handler early-returns on `if (!me.token)` before it ever
    // reaches postJson, so the panels rendered, the prices were right, and
    // clicking Unlock did nothing at all.
    //
    // This string is deliberately not a valid session token, so BOTH layers
    // still hold: postJson short-circuits before any request is made, and in
    // the impossible case that one escaped, no write route would authenticate
    // it. It exists only to satisfy the client-side "are you signed in" gates.
    token: "demo-sandbox-not-a-session",
    shells: 999999,
    points: 1860,
    heldUsd: 25,
    tank: resolveTank({ tank: "sherman", camo: "olive", decals: ["first-colors"] }),
    ownedTanks: ["stuart", "sherman"],
    commander: "diesel",
    // One earned camo and one still locked in each direction, so the sandbox
    // shows BOTH states of the ladder: desert swappable, gold showing its earn
    // line, and the Big Mike slot locked with his.
    ownedCamos: ["olive", "desert"],
    ownedCommanders: [],
    bondsTier: 2,
    streakDays: 4,
    crates: [],
    // Armor one level from its milestone tank, so the sandbox can demonstrate
    // the whole "max a stat, win its tank" arc with a single purchase.
    stats: { botox: 3, drugs: 1, ozempic: 0, aura: 4, optics: 0 },
  };
}

/**
 * THE SANDBOX WALLET.
 *
 * Module-level and mutable, because the whole point is watching a balance go
 * down. It is seeded from demoHqMe so the number in the wallet and the number
 * on screen start life agreeing.
 */
const wallet = {
  shells: 999999,
  ownedTanks: ["stuart", "sherman"] as string[],
  decals: ["first-colors"] as string[],
  // Mirrors demoHqMe's seed; the upgrade sim below mutates these.
  stats: { botox: 3, drugs: 1, ozempic: 0, aura: 4, optics: 0 } as Record<string, number>,
  // The fielded look, so cosmetic sets can return a properly RESOLVED tank
  // (the panels' callbacks require r.tank to be a ResolvedTank; a bare echo
  // of the set body made every demo repaint report failure).
  tank: "sherman",
  camo: "olive",
};

/**
 * Synthesize the reply a write route would have sent.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not invent prices. Tanks charge TANK_TIER_PRICES and vault items
 *     charge the deal's own price, read from the same modules the real routes
 *     read. A demo that charges made-up numbers demonstrates a shop that does
 *     not exist.
 *   - It does not always succeed. If the wallet cannot cover it, this returns
 *     the same `{error}` shape the route would. With the sandbox funded at
 *     999,999 you will not hit that by accident, but the branch is real and
 *     still fires if you spend your way down to it.
 */
export function demoReply(url: string, body: unknown): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;

  if (url.includes("/tank-unlock")) {
    const key = String(b.tank || "");
    const tank = TANK_ROSTER.find((t) => t.key === key);
    if (!tank) return { error: "Unknown tank." };
    if (wallet.ownedTanks.includes(key)) return { error: "Already in the motor pool." };
    const price = TANK_TIER_PRICES[tank.tier] ?? 0;
    if (price > wallet.shells) {
      return { error: `Not enough Shells. ${price} needed, ${wallet.shells} banked.` };
    }
    wallet.shells -= price;
    wallet.ownedTanks = [...wallet.ownedTanks, key];
    return {
      ok: true,
      tank: resolveTank({ tank: (wallet.tank = key), camo: wallet.camo, decals: wallet.decals }),
      ownedTanks: wallet.ownedTanks,
      shells: wallet.shells,
    };
  }

  if (url.includes("/vault-buy")) {
    const key = String(b.item || "");
    // ONE deal a day. vaultDayNumber + vaultDealForDay is exactly the pair the
    // panel renders from (panels.tsx:958), not an equivalent-looking day count,
    // so the sandbox can never price a different item than the one on screen.
    const deal = vaultDealForDay(vaultDayNumber(Date.now()));
    if (deal.key !== key) return { error: "That deal has rotated out." };
    if (wallet.decals.includes(key)) return { already: true };
    if (deal.price > wallet.shells) {
      return { error: `Not enough Shells. ${deal.price} needed, ${wallet.shells} banked.` };
    }
    wallet.shells -= deal.price;
    wallet.decals = [...wallet.decals, key];
    return { ok: true, decals: wallet.decals, shells: wallet.shells };
  }

  if (url.includes("/claim-ftue")) {
    wallet.shells += 50;
    return { ok: true, shells: wallet.shells };
  }

  // /api/s5/upgrade: the stat shop, simulated with the REAL price curve and
  // the REAL milestone table, so the sandbox demonstrates the exact arc a
  // funded account gets (including "max Armor, the Tiger joins your garage").
  if (url.includes("/upgrade")) {
    const stat = String(b.stat || "");
    const level = Math.max(0, Math.floor(Number(wallet.stats[stat]) || 0));
    const price = statNextPrice(stat as StatKey, level);
    if (price === null) return { error: "Already at its top level." };
    if (wallet.shells < price) {
      return { error: `Not enough Shells. ${price} needed, ${wallet.shells} banked.` };
    }
    wallet.shells -= price;
    wallet.stats[stat] = level + 1;
    const m = STAT_MILESTONE_TANKS.find((x) => x.stat === stat && level + 1 >= x.atLevel);
    let milestoneTank: string | null = null;
    if (m && !wallet.ownedTanks.includes(m.tank)) {
      wallet.ownedTanks = [...wallet.ownedTanks, m.tank];
      milestoneTank = m.tank;
    }
    return {
      ok: true,
      stats: { ...wallet.stats },
      shells: wallet.shells,
      ownedTanks: wallet.ownedTanks,
      milestoneTank,
    };
  }

  // /api/s5/hq: cosmetic sets (tank, commander, camo) are free. Mutate the
  // sandbox wallet's fielded look and answer in the REAL route's shape — the
  // panel callbacks require r.tank to be a ResolvedTank, so a bare echo of the
  // set body reads as failure ("Could not repaint") even though nothing failed.
  const set = (typeof b.set === "object" && b.set ? b.set : {}) as Record<string, unknown>;
  if (typeof set.tank === "string") wallet.tank = set.tank;
  if (typeof set.camo === "string") wallet.camo = set.camo;
  return {
    ok: true,
    ...(typeof set.commander === "string" ? { commander: set.commander } : {}),
    tank: resolveTank({ tank: wallet.tank, camo: wallet.camo, decals: wallet.decals }),
    ownedTanks: wallet.ownedTanks,
  };
}

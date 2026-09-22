/**
 * Turning window SHARES into a payout (M9/M9b). A pure function, like the
 * scorer it follows: no clock, no I/O, no database, so it can be tested
 * headlessly and audited later against what actually paid.
 *
 * This is the only place in Domain Kitchen where a fraction becomes an amount,
 * which is why it lives beside `campaign.ts` and not inside a script.
 *
 * ── WHY BIGINT AND NOT NUMBERS ───────────────────────────────────────────
 * A pot is a SET AMOUNT (Mike, 2026-08-10) but not always dollars: it may be
 * "$300 of this token" or "1% of total supply" of another. One percent of a
 * billion-token supply at 18 decimals is 1e25 base units, which is about a
 * BILLION times past Number.MAX_SAFE_INTEGER. Doing that arithmetic in floats
 * would lose precision silently, which is the worst way for money code to be
 * wrong. So the pot and every payout are BigInt MINOR UNITS throughout:
 * cents for a dollar pot, base units for a token pot. The caller decides which;
 * this file never needs to know.
 *
 * ── THE PROPERTY THAT MATTERS ────────────────────────────────────────────
 * The rows sum EXACTLY to the intended total. Rounding each row on its own
 * drifts by up to one unit per row, and a payout that does not sum is one
 * somebody reconciles by hand at midnight. Largest remainder fixes it: floor
 * everything, then hand the leftover units to the rows that lost most in the
 * flooring.
 *
 * Nothing here pays anybody. It produces a list a human sends.
 */

/**
 * Fixed-point scale for a share; shares are fractions of 1, so 1e12 is ample.
 *
 * Written as BigInt("...") rather than a `1e12n` literal: this project's tsc
 * target predates BigInt literals and rejects them outright. Same reason every
 * ZERO and ONE below is spelled out.
 */
const SHARE_SCALE = BigInt("1000000000000"); // 1e12
const ZERO = BigInt(0);
const ONE = BigInt(1);

export interface OwedShare {
  wallet: string;
  /** this wallet's fraction of the WHOLE pot, 0..1 */
  share: number;
  /** how many windows they appeared in, carried for the report */
  windows: number;
}

export interface SettledRow {
  wallet: string;
  /** minor units: cents for a dollar pot, base units for a token pot */
  units: bigint;
  windows: number;
}

export interface Settlement {
  rows: SettledRow[];
  /** units actually assigned across the rows */
  totalUnits: bigint;
  /** what the shares entitled them to, before rounding */
  targetUnits: bigint;
  /** pot minus assigned: the ADR-0111 under-distribution, reported not forced */
  unspentUnits: bigint;
  /** true when the rows add up exactly. Never ship a false. */
  exact: boolean;
}

/**
 * Split a pot across wallets by share, in whole minor units.
 *
 * `potUnits` is the WHOLE pot. The shares may sum to less than 1 on purpose:
 * ADR-0111's per-wallet cap deliberately leaves a thin window
 * under-distributed and the remainder is reported as unspent rather than
 * being forced out to somebody who did not earn it.
 */
export function settleShares(owed: OwedShare[], potUnits: bigint): Settlement {
  const clean = owed.filter(
    (o) =>
      o &&
      typeof o.wallet === "string" &&
      Number.isFinite(o.share) &&
      o.share > 0 &&
      potUnits > ZERO
  );
  if (clean.length === 0) {
    return {
      rows: [],
      totalUnits: ZERO,
      targetUnits: ZERO,
      unspentUnits: potUnits > ZERO ? potUnits : ZERO,
      exact: true,
    };
  }

  // shares -> fixed point, so the split is integer arithmetic end to end
  const parts = clean.map((o) => {
    const fp = BigInt(Math.round(Math.min(1, o.share) * 1e12));
    const scaled = potUnits * fp;
    return {
      wallet: o.wallet,
      windows: o.windows,
      fp,
      units: scaled / SHARE_SCALE,
      rem: scaled % SHARE_SCALE,
    };
  });

  // what the shares ENTITLE them to in whole units. Derived from the shares
  // themselves, never re-derived from the floored units (that would be
  // circular and would quietly make `exact` always true).
  const totalFp = parts.reduce((n, p) => n + p.fp, ZERO);
  const targetUnits = (potUnits * totalFp) / SHARE_SCALE;

  let assigned = parts.reduce((n, p) => n + p.units, ZERO);

  /**
   * Deterministic ordering: biggest loser in the flooring first, ties broken
   * by wallet. The same input must always produce the identical payout, or a
   * run cannot be checked against the previous one.
   */
  const order = [...parts].sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1;
    return a.wallet < b.wallet ? -1 : 1;
  });
  for (let i = 0; assigned < targetUnits && i < order.length; i++) {
    order[i].units += ONE;
    assigned += ONE;
  }
  // cannot happen, but money code says its invariants out loud
  for (let i = order.length - 1; assigned > targetUnits && i >= 0; i--) {
    if (order[i].units > ZERO) {
      order[i].units -= ONE;
      assigned -= ONE;
    }
  }

  const rows = parts
    .filter((p) => p.units > ZERO)
    .map((p) => ({ wallet: p.wallet, units: p.units, windows: p.windows }))
    .sort((a, b) => (a.units !== b.units ? (a.units > b.units ? -1 : 1) : a.wallet < b.wallet ? -1 : 1));

  const totalUnits = rows.reduce((n, r) => n + r.units, ZERO);
  return {
    rows,
    totalUnits,
    targetUnits,
    unspentUnits: potUnits - totalUnits,
    exact: totalUnits === targetUnits,
  };
}

/**
 * Minor units as a human-readable amount. `decimals` is 2 for a dollar pot and
 * the token's own decimals for a token pot.
 *
 * String maths, not float maths: `Number(1e25) / 1e18` is already wrong.
 */
export function formatUnits(units: bigint, decimals: number): string {
  const neg = units < ZERO;
  const abs = neg ? -units : units;
  // no `10n ** x`: this tsc target has neither BigInt literals nor BigInt
  // exponentiation, so the scale is built by multiplication
  let base = ONE;
  for (let i = 0; i < decimals; i++) base *= BigInt(10);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = decimals > 0 ? "." + frac.toString().padStart(decimals, "0") : "";
  return `${neg ? "-" : ""}${whole.toString()}${fracStr}`;
}

/** Trim a formatted amount to at most `places` decimals, for display only. */
export function trimUnits(units: bigint, decimals: number, places = 4): string {
  const s = formatUnits(units, decimals);
  if (!s.includes(".")) return s;
  const [w, f] = s.split(".");
  const cut = f.slice(0, places).replace(/0+$/, "");
  return cut ? `${w}.${cut}` : w;
}

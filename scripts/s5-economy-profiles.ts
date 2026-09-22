/**
 * S5 POINTS DASHBOARD — what seven different players actually earn.
 *
 * Every number here comes from the live economy block in
 * doma-reporter/modules/season5/index.js, not from estimates:
 *
 *   dailyHold = round( s5HoldBase(held, distinctDomains) x tierMult x freshMult )
 *
 *   s5HoldBase(h, n):  cap  = min(150, 100 + 10n)          dynamic ceiling
 *                      full = min(h, 25)                    full rate below the knee
 *                      soft = min(max(0, h-25), cap-25)     quarter rate above it
 *                      = 10.0 * (full + 0.25 * soft)
 *
 *   tierMult   = 1 + 0.05 * (clamp(distinctDomains,1,5) - 1)   x1.00 .. x1.20
 *   freshMult  = held-weighted freshness, x2.0 on a listing day easing to x1.0
 *                over 10 days. Modelled at x1.0 (mature domains) so these are
 *                FLOORS, not best cases.
 *
 *   posts      30 per credited post, 1/day, artifact-gated, season cap 600.
 *              Engagement can upgrade a post to 60 or 150 (max 170 total).
 *   games      4..10 per run by score, 40/day across all four.
 *
 * Season = 14 days ($350/wk x 2 = the $700 base pool).
 */
const HOLD_RATE = 10.0;
const SOFT_KNEE = 25;
const SOFT_FACTOR = 0.25;
const CAP_BASE = 100;
const CAP_PER_DOMAIN = 10;
const CAP_MAX = 150;
const TIER_STEP = 0.05;
const TIER_MAX = 5;
const POST_POINTS = 30;
const POST_SEASON_CAP = 600;
const GAME_CAP_DAY = 40;
const DAYS = 14;

const holdCap = (n: number) => Math.min(CAP_MAX, CAP_BASE + CAP_PER_DOMAIN * n);
function holdBase(held: number, domains: number) {
  const cap = holdCap(domains);
  const full = Math.min(held, SOFT_KNEE);
  const soft = Math.min(Math.max(0, held - SOFT_KNEE), cap - SOFT_KNEE);
  return HOLD_RATE * (full + SOFT_FACTOR * soft);
}
const tierMult = (domains: number) => 1 + TIER_STEP * (Math.max(1, Math.min(TIER_MAX, domains)) - 1);
const dailyHold = (held: number, domains: number) => Math.round(holdBase(held, domains) * tierMult(domains));

type Profile = {
  label: string;
  held: number;
  domains: number;
  /** points earned from games on a day they play */
  gamePtsPerActiveDay: number;
  gameDays: number;
  postDays: number;
};

const PROFILES: Profile[] = [
  { label: "1. Power user", held: 150, domains: 5, gamePtsPerActiveDay: 40, gameDays: 7, postDays: 14 },
  { label: "2. Whale", held: 150, domains: 5, gamePtsPerActiveDay: 40, gameDays: 4, postDays: 2 },
  { label: "3. Medium", held: 50, domains: 3, gamePtsPerActiveDay: 21, gameDays: 7, postDays: 7 },
  { label: "4. Low-medium", held: 50, domains: 3, gamePtsPerActiveDay: 10, gameDays: 3, postDays: 3 },
  { label: "5. Low hold, max games", held: 5, domains: 1, gamePtsPerActiveDay: 40, gameDays: 14, postDays: 14 },
  { label: "6. Low hold, med games", held: 5, domains: 1, gamePtsPerActiveDay: 21, gameDays: 7, postDays: 3 },
  { label: "7. Low hold, low games", held: 5, domains: 1, gamePtsPerActiveDay: 10, gameDays: 3, postDays: 0 },
];

console.log("S5 SEASON TOTALS (14 days, freshness at x1.0 = the floor)\n");
console.log(
  "profile".padEnd(26) +
    "hold/day".padStart(9) +
    "HOLD".padStart(9) +
    "GAMES".padStart(8) +
    "POSTS".padStart(8) +
    "TOTAL".padStart(9) +
    "  games as % of total",
);
console.log("-".repeat(84));

const rows = PROFILES.map((p) => {
  const perDay = dailyHold(p.held, p.domains);
  const hold = perDay * DAYS;
  const games = Math.min(p.gamePtsPerActiveDay, GAME_CAP_DAY) * p.gameDays;
  const posts = Math.min(POST_POINTS * p.postDays, POST_SEASON_CAP);
  const total = hold + games + posts;
  return { ...p, perDay, hold, games, posts, total, gamePct: total ? (games / total) * 100 : 0 };
});

for (const r of rows) {
  console.log(
    r.label.padEnd(26) +
      String(r.perDay).padStart(9) +
      String(r.hold).padStart(9) +
      String(r.games).padStart(8) +
      String(r.posts).padStart(8) +
      String(r.total).padStart(9) +
      `   ${r.gamePct.toFixed(1)}%`,
  );
}

console.log("\n-- what this says --");
// NOT `top`: that is a DOM global (window.top), and scripts/*.ts is inside the
// build's type-check, so declaring it at module scope fails `next build` even
// though the file never runs in a browser.
const best = rows[0];
const worst = rows[6];
console.log(`spread top to bottom: ${best.total} vs ${worst.total} = ${(best.total / worst.total).toFixed(1)}x`);
const maxGamer = rows[4];
console.log(
  `a MAX gamer with the minimum $5 hold (${maxGamer.total}) vs a whale who barely plays (${rows[1].total}): ` +
    `${(rows[1].total / maxGamer.total).toFixed(1)}x in the whale's favour`,
);
console.log(`\nholdings ceiling: $150 across 5 domains = ${dailyHold(150, 5)}/day = ${dailyHold(150, 5) * DAYS} a season`);
console.log(`games ceiling:    40/day x 14 = ${GAME_CAP_DAY * DAYS} a season`);
console.log(`posts ceiling:    30/day x 14 = ${Math.min(POST_POINTS * DAYS, POST_SEASON_CAP)} (season cap ${POST_SEASON_CAP})`);

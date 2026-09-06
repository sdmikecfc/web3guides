/**
 * BATTLE BOTS API SHAPES: what the routes return and the client renders.
 * Type-only imports from the engine and the fixtures, no server-only
 * import, so a client component may import these TYPES (the import is
 * erased at compile time) without pulling the service client along.
 */
import type { Build, Mode, Orders, PaintId, Slot, Stats, Tier } from "../_engine/parts";
import type { Difficulty, WeightClass } from "../_engine/rewards";
import type { DecalId, Socket } from "@/lib/bots/fixtures";
import type { BotLook, HatWon, LookEarned, LookMarks, SocketPaints } from "@/lib/bots/look";

/**
 * A ROBOT'S WHOLE LOOK, the way every surface that draws one reads it.
 *
 *  - `paints` is the found half: one colour per socket, from the colour each
 *    part arrived in and keeps for life (ADR-0141). A robot is normally FOUR
 *    colours at once and the weapon rides the arm, which is why no surface
 *    may flatten this to a single paint any more.
 *  - `look` is the chosen half: the face, the sticker, its place and colour,
 *    the won hat and the plate number. The server built it from the bot row
 *    and checked it at save time; a client never gets to say what it is.
 *  - `marks` is the earned half: stars, patches, cuff bands, sparkle and the
 *    crown, derived from wins, lost fights, level and a champion card.
 *  - `wins` rides along because the plate prints the number once the star
 *    ladder has run past its last drawn step, so nothing caps.
 */
export interface LookView {
  paints: SocketPaints;
  look: BotLook;
  marks: LookMarks;
  wins: number;
}

export interface BotName {
  first: string;
  second: string;
  num: number | null;
}

export interface PartView {
  id: number;
  partKey: string;
  slot: Slot;
  tier: Tier;
  s: Stats;
  /** the colour this card ARRIVED in and keeps for life (body parts only);
   * there is no paint job, so this never changes after the card is made
   * (ADR-0141). Absent on a weapon. */
  paint?: PaintId;
  botId: number | null;
  source: string;
  provenance: string;
  listPrice: number;
  salvage?: number;
  name: string;
  familyName: string | null;
  color?: PaintId;
  design: 1 | 2;
  lore: string;
}

export interface BotView {
  id: number;
  bay: number;
  name: BotName;
  nameText: string;
  decal: DecalId | null;
  /** the bot's plate colour (look only; part paint is on the parts) */
  paint: PaintId;
  /**
   * WHAT THIS ROBOT LOOKS LIKE. Built on the server from the part rows and
   * the bot row (src/lib/bots/look.ts), never from anything a client sent.
   * Every surface that draws a robot reads these three instead of flattening
   * it to the single `paint` above.
   */
  look: BotLook;
  paints: SocketPaints;
  marks: LookMarks;
  parts: Record<Slot, number | null>;
  sockets?: Record<Socket, number | null>;
  total: number;
  tier: Tier;
  weightClass: WeightClass;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  /** ISO time the shop lets it go; null = ready */
  repairUntil: string | null;
  inShop: boolean;
  attacksLeft: number;
  defencesLeft: number;
  listed: boolean;
  complete: boolean;
}

/** One listing on today's shipment (ADR-0141). The id is "row:n" ("t1:3"),
 * never the catalog key: one catalog part can sit on the shelf twice in two
 * colours. */
export interface ShopListingView {
  id: string;
  row: "t1" | "t2" | "t3" | "t4" | "rack";
  partKey: string;
  name: string;
  slot: Slot;
  tier: Tier;
  /** the colour the card will wear for life; null on a weapon */
  color: PaintId | null;
  /** true when this is the row's colour of the day */
  dayColor: boolean;
  price: number;
  bought: boolean;
  needsLevel: number;
}

export interface ShopView {
  day: string;
  weekday: string;
  /** days since the shop's epoch Monday */
  dayIndex: number;
  /** the shipment line ("Came in on the morning barge.") */
  name: string;
  colors: { t1: PaintId; t2: PaintId; t3: PaintId };
  t4: { week: number; weekday: number; slot: Slot; color: PaintId | null };
  rackTier: Tier;
  listings: ShopListingView[];
}

export interface PlayerView {
  walletName: string;
  coins: number;
  battlePoints: number;
  /** the wallet's best bot level (the shop's tier gate reads this) */
  level: number;
  isTest: boolean;
  enlistedAt: string;
}

export interface MeView {
  ok: true;
  day: string;
  player: PlayerView;
  bots: BotView[];
  parts: PartView[];
  shop: ShopView;
}

export interface FightIdentityView {
  name: string;
  /** a wallet name, or "House"; never an address */
  wallet: string;
  wins: number;
  losses: number;
  strategy: string;
  paint: PaintId;
  tier: Tier;
  total: number;
}

export interface FightRewardsView {
  attackerCoins: number;
  attackerPoints: number;
  attackerXp: number;
  defenderCoins: number;
  stakeHeld: number;
  stakePayout: number;
  houseBonus: number;
  drop: { tier: Tier; partKey: string; name: string } | null;
  /** the hat this fight won, kind and colour, from beating a bigger robot on
   * the same drop roll that gives the part. Never bought, never on the shelf. */
  hat: HatWon | null;
  attackerRepair: boolean;
}

/** GET /api/bots/fight/[id] */
export interface FightView {
  ok: true;
  id: string;
  seed: number;
  buildA: Build;
  buildB: Build;
  orders: [Orders, Orders];
  mode: Mode;
  difficulty: Difficulty | null;
  engineVersion: number;
  hash: number;
  winner: 0 | 1;
  frames: number;
  end: "ko" | "timeout";
  chain: string;
  /** "head off", "body cracked", "time ran out" */
  finisher: string;
  names: [string, string];
  walletNames: [string, string];
  ids: [FightIdentityView, FightIdentityView];
  /**
   * BOTH ROBOTS AS THEY WERE AT THE BELL. Snapshotted into the stored result
   * at resolve time, so a replay watched a month later shows the colours,
   * the face, the sticker, the hat and the marks the two robots had that
   * day, not the ones they have now. A fight row stored before looks existed
   * falls back to the colours on its own saved build and no marks.
   */
  looks: [LookView, LookView];
  stake: number;
  classGap: number;
  rewards: FightRewardsView;
  createdAt: string;
  modeLabel: string;
  houseShape: string | null;
  /** true when the caller owns side A (the attacker) */
  mine: boolean;
}

export interface FightSummary {
  id: string;
  mode: "pve" | "pvp";
  difficulty: Difficulty | null;
  createdAt: string;
  frames: number;
  seconds: number;
  end: "ko" | "timeout";
  winner: 0 | 1;
  /** side A (the attacker) first, so a live card names both without telling the result */
  names: [string, string];
  walletNames: [string, string];
  paints: [PaintId, PaintId];
  /** both robots as they were at the bell, so a thumbnail draws the real
   * robot instead of one flat colour (same snapshot as FightView.looks) */
  looks: [LookView, LookView];
  winnerName: string;
  loserName: string;
  winnerWallet: string;
  loserWallet: string;
  winnerTier: Tier;
  loserTier: Tier;
  finisher: string;
  chain: string;
  /** loser total minus winner total when the weaker bot won, else 0 */
  upset: number;
}

export interface PveLadderRow {
  difficulty: Difficulty;
  title: string;
  shapeId: string;
  shapeName: string;
  feel: string;
  lore: string;
  /** null until the caller picks a bot */
  houseTotal: number | null;
  tier: Tier | null;
  coinsWin: number;
  coinsLose: number;
  points: number;
  dropPercent: number;
}

export interface DefenderRow {
  botId: number;
  name: string;
  walletName: string;
  /** the bot's plate colour, for the drawn thumb */
  paint: PaintId;
  tier: Tier;
  total: number;
  weightClass: WeightClass;
  wins: number;
  losses: number;
  /** defender class minus the caller's selected bot's class; null with no bot */
  classGap: number | null;
  gapWords: string | null;
  housePercent: number;
  defencesLeft: number;
  challengedToday: boolean;
}

/** GET /api/bots/battles */
export interface BattlesView {
  ok: true;
  day: string;
  me: { bots: BotView[]; selected: number | null; coins: number; walletName: string } | null;
  pve: PveLadderRow[];
  defenders: DefenderRow[];
  live: FightSummary[];
  featured: { upset: FightSummary | null; longest: FightSummary | null; fastestKo: FightSummary | null };
  recent: FightSummary[];
}

export interface PaperLineView {
  text: string;
  link: { kind: "watch"; id: string } | { kind: "shop" } | null;
}

/**
 * ONE KEEPSAKE THIS WALLET HAS WON, off a row in battle_bots_cards whose
 * signature has already been checked (_server/cards.ts loadCards).
 *
 * It carries what the card SAYS and nothing about how it was made: no
 * signature, no fight code, no engine number. Those are for a verify page,
 * and a keepsake a seven year old is looking at is a picture and a sentence.
 */
export interface EarnedCardView {
  /** "champion-first-win", or "champion-week" once the weekly job writes one */
  kind: string;
  botId: number | null;
  /** ISO time the card was made */
  at: string;
  /** the robot it names */
  botName: string;
  /** the robot it beat */
  beat: string;
  /** the fight behind it, so the card can be watched */
  fightId: string;
}

/**
 * ONE ROBOT'S EARNED HALF: the marks it wears, everything the server says it
 * has unlocked, how many other robots share its look, and its cards.
 *
 * EVERY FIELD IS DERIVED FROM ROWS (the ninth law). None of it is a client's
 * claim and none of it comes out of localStorage, which is exactly why it
 * needs a route of its own: the garage screen keeps its builds in the browser
 * and the browser is not allowed to say what a robot has earned.
 */
export interface EarnedBotView {
  botId: number;
  bay: number;
  nameText: string;
  /** the record the marks were walked from. It rides along because a screen
   * that prints a robot's wins beside its stars must print the SAME wins the
   * stars were counted off, or one card carries two answers. */
  wins: number;
  losses: number;
  look: BotLook;
  paints: SocketPaints;
  earned: LookEarned;
  marks: LookMarks;
  /** how many OTHER robots wear this look, or null when the count could not
   * be taken (_server/twins.ts). Null is not zero: a screen shows no line. */
  twins: number | null;
  cards: EarnedCardView[];
}

/** GET /api/bots/earned */
export interface EarnedView {
  ok: true;
  day: string;
  bots: EarnedBotView[];
}

/** GET /api/bots/paper */
export interface PaperView {
  ok: true;
  date: string;
  since: string;
  lines: PaperLineView[];
}

/** POST /api/bots/enlist */
export interface EnlistView {
  ok: true;
  joined: boolean;
  welcomeBack: boolean;
  /** present when a valid signature came with the request */
  token?: string;
  walletName: string;
  coins: number;
  needsSignature?: boolean;
}

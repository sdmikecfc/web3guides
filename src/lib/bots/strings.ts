/**
 * BATTLE BOTS string tables (week 2: English only).
 *
 * Same mechanism as the proven S7 tables (src/lib/s7/strings.ts): one object
 * per locale with the SAME keys, `en` is the source of truth, and
 * `BotsDict = typeof en` forces any later locale to match every key at
 * compile time.
 *
 * COPY LAWS (screens doc section 8): plain words for a global ESL audience;
 * short sentences, one clause; whole numbers; no algebra; no finance jargon
 * beyond the product words people already use (strategy, fill, limit order);
 * no idioms; no em-dashes anywhere; never a "win" next to a dollar figure,
 * never a dollar promise of any kind; wallet names only, never addresses or
 * handles; the game says what
 * happened, never what you should feel; every lock states its reason; every
 * number has a unit word.
 *
 * Slot words for {slot}: head, body, left arm, right arm, left leg, right
 * leg, weapon (say "body" to players, keep `torso` in code). ROI is a whole
 * percent with a sign ("+12%").
 *
 * Templates use {name} placeholders; fill() below replaces them.
 */

const en = {
  /* ── the starter copy pack (screens doc section 8, verbatim) ─────────── */
  landing: {
    headline: "Build a bot. Trade to feed it. Watch it fight.",
    connect: "Connect wallet",
    watch: "Watch a fight",
    sub: "Free to play. Your trading feeds your garage.",
  },
  strategy: {
    title: "Set up your strategy",
    doma: "Open Doma auto trading",
    mcp: "Use the MCP instead",
    mcpPrompt: "Set up a Buy Low Sell High strategy on Doma for my wallet.\nWatch 3 tokens I choose.\nTell me when the first trade fills.",
    notSeen: "Strategy: not seen yet. Your garage keeps working.",
    seen: "Strategy live: {kind}. Your crew is on shift.",
    same: "Set up the same strategy",
  },
  garage: {
    title: "Garage No. {n}",
    ready: "Ready. {n} attacks left today",
    shop: "In the shop. {time} left",
    fighting: "In a battle. Watch",
    empty: "Empty bay. Build",
    notReady: "{n} empty slots",
    full: "Your garage holds 5 bots. Recycle one to make room.",
    paper: "Morning Paper",
    quietNight: "Nobody challenged you. Quiet night.",
  },
  build: {
    title: "Build",
    pick: "Pick a {slot}",
    equip: "Equip",
    save: "Save to bay {n}",
    toBattle: "Take to Battles",
    tier: "Tier {t} bot. {pts} points.",
    notReady: "Not ready. {n} empty slots.",
    name: "Name your bot",
    shuffle: "Shuffle",
    paintNote: "Paint and decals change the look only.",
    firstCoach: "This is your first bot. It needs 7 parts. You have {coins} starter coins.",
  },
  shop: {
    title: "Today's shelf",
    buy: "Buy for {coins}",
    notEnough: "You need {n} more coins.",
    rotates: "New parts every day at 00:00 UTC.",
  },
  part: {
    foundShop: "Found in the {day} shop",
    recycledFrom: "Recycled from {bot}",
    starter: "Starter part",
    recycleFor: "Recycle for {coins}",
  },
  recycle: {
    title: "Recycle {bot}?",
    back: "You get these coins back:",
    note: "Bay {n} opens up. Paint and name are lost.",
    confirm: "Recycle for {coins} coins",
    keep: "Keep it",
  },
  battles: {
    pickBot: "Pick a bot",
    fight: "Fight",
    challenge: "Challenge",
    needsStrategy: "Needs a live strategy",
    reward: "x{n} points",
    half: "half points",
    none: "no points",
    live: "Live now",
    recent: "Recent",
    watch: "Watch",
    attacksLeft: "{n} attacks left today",
  },
  fight: {
    bell: "The bell rings.",
    swing: "{bot} swings at the {slot}.",
    hit: "{slot} takes {dmg}.",
    block: "Blocked. The {slot} takes {dmg}.",
    miss: "{bot} dodges.",
    brk: "The {slot} is off.",
    kneel: "{bot} cannot stand.",
    ko: "Knockout.",
    share: "Share the knockout",
    making: "Making your clip",
    replay: "Watch the replay",
  },
  board: {
    tabs: ["Trading Score", "Battle Points", "ROI"],
    visit: "Visit",
    noStrategy: "No strategy yet",
  },
  profile: {
    record: "{w} wins. {l} losses.",
    tradingStrip: "Trading Score {score} . ROI {roi}% . {fills} fills in 30 days",
  },
  card: {
    knockout: "KNOCKOUT",
    champion: "CHAMPION",
    lost: "Lost to {bot}. {slot} off at {time}. Rematch tomorrow.",
    shareText: "{winner} knocked out {loser}. Watch: {url}",
  },
  legal: "Operator funded. Nothing here is guaranteed money.",

  /* ── week-1 additions (the Build screen chrome; not in the starter pack) ─ */
  nav: {
    wordmark: "BATTLE BOTS",
    garage: "Garage",
    build: "Build",
    shop: "Shop",
    battles: "Battles",
    board: "Board",
    aria: "Game sections",
    coinsAria: "Your coins",
    walletAria: "Your wallet name",
  },
  ui: {
    parts: "PARTS",
    owned: "{n} owned",
    all: "All",
    onBot: "on bot",
    buyMore: "Buy more parts",
    yourBot: "YOUR BOT",
    paint: "PAINT",
    decal: "Decal",
    total: "Total",
    tierBadge: "TIER {t}",
    pts: "{n} pts",
    notReadyBadge: "NOT READY",
    emptyCount: "{n} empty",
    editName: "Edit the name",
    number: "Number",
    noNumber: "No number",
    firstWord: "FIRST WORD",
    secondWord: "SECOND WORD",
    done: "Done",
    saved: "Saved to bay {n}.",
    bayLabel: "Bay {n}",
    lore: "Lore",
    closeLore: "Close",
    garageStub: "Your garage. Five bays. Pick one to build.",
    landingGarage: "Open your garage",
    /** the nine readout stats, in readout order (screens doc 2.1 rows 3 to 11) */
    stat: {
      speed: "Speed",
      strength: "Strength",
      dodge: "Dodge",
      damage: "Damage",
      block: "Block",
      health: "Health",
      luck: "Luck",
      accuracy: "Accuracy",
      attackSpeed: "Attack speed",
    },
    /** short stat labels for the 88px tray cards (mono 12) */
    statShort: {
      speed: "SPD",
      strength: "STR",
      dodge: "DGE",
      damage: "DMG",
      block: "BLK",
      health: "HP",
      luck: "LCK",
      accuracy: "ACC",
      attackSpeed: "ASP",
    },
    /** the five part cards, as the player reads them */
    card: {
      head: "Head",
      torso: "Body",
      arms: "Arms",
      legs: "Legs",
      weapon: "Weapon",
    },
    /** the seven sockets, for "Pick a {slot}" and the fight lines */
    socket: {
      head: "head",
      torso: "body",
      armL: "left arm",
      armR: "right arm",
      legL: "left leg",
      legR: "right leg",
      weapon: "weapon",
    },
    tierWord: "Tier {t}",
  },

  /* ── week-2 additions: sets, paint jobs, the garage, the shop ─────────── */

  /** the SET PANEL under the readout (the guide, "Matched sets") */
  set: {
    title: "SETS",
    family: "{family} set: {n} of 4",
    noFamily: "Style set: 0 of 4",
    color: "Color set: {n} of 4",
    bonus: "Set bonus: +{n} to every stat in fights",
    none: "Set bonus: none yet",
    hint: "Match all four body parts by color or by style and your bot fights stronger.",
    weapon: "The weapon never counts toward a set.",
    /** "Kettle . mint" on every card (family, then colour) */
    line: "{family} . {color}",
  },

  /** the PAINT panel now charges coins */
  paintJob: {
    job: "Paint job: {coins} coins",
    parts: "{n} parts at 25 coins each",
    onePart: "1 part at 25 coins",
    which: "Paint which part",
    all: "All four",
    confirm: "Paint for {coins} coins",
    cancel: "Keep the old paint",
    already: "Already {color}. No charge.",
    notEnough: "You need {n} more coins.",
    done: "Painted {color}. {coins} coins.",
    free: "Painted {color}. No charge.",
    rule: "25 coins per body part. The painted color is what counts for the color set.",
    nothing: "No body parts on the bot yet.",
  },

  /** the eight paints, as the player reads them */
  paintName: {
    mint: "mint",
    coral: "coral",
    butter: "butter",
    sky: "sky",
    lilac: "lilac",
    moss: "moss",
    cream: "cream",
    ink: "ink",
  },

  /** the garage screen (screens doc 3) */
  garageUi: {
    street: "Sprocket Row",
    door: "No. {n}",
    walkLeft: "Ten doors to the left",
    walkRight: "Ten doors to the right",
    yourDoor: "Your door",
    neighbour: "Garage No. {n} is not open yet.",
    /** the status chips (canvas tag and DOM chip share these) */
    chip: {
      ready: "Ready . {n} attacks left today",
      shop: "In the shop . {time} left",
      battle: "In a battle . watch",
      notReady: "{n} empty slots",
      empty: "Empty bay . build",
    },
    bays: "BAYS",
    toolBoard: "TOOL BOARD",
    spares: "{n} spare parts",
    noSpares: "No spare parts. The shop has more.",
    newBot: "New bot",
    record: "{w} wins . {l} losses",
    lastFights: "LAST 5 FIGHTS",
    noFights: "No fights yet.",
    beat: "beat {bot}",
    lostTo: "lost to {bot}",
    watch: "Watch",
    recycle: "Recycle",
    masthead: "SPROCKET ROW MORNING PAPER",
    paperChip: "Paper",
    partsChip: "Parts",
    readAll: "Read the paper",
    shopLink: "Shop",
    crewTitle: "{kind} crew",
    crewFills: "{n} fills today",
    crewCoins: "{n} coins today",
    crewTokens: "Watching {tokens}",
    changeStrategy: "Change strategy",
    speech: "Filled. {n} coins.",
    speechAdded: "Added. {n} coins.",
    strategyKind: {
      blsh: "Buy Low Sell High",
      position: "Build a Position",
      limit: "Limit order",
    },
    putOn: "Put on bay {n}",
    putOnAny: "Put on a bot",
    pickBay: "Put it on which bot",
    noBotForSlot: "No bot has an open {slot} slot.",
    swapped: "{name} is on bay {n}.",
    recycledPart: "{name} recycled. {coins} coins.",
    recycledBot: "{bot} recycled. {coins} coins. Bay {n} is open.",
    repairLine: "Back from the shop in {time}.",
    bayDot: "Bay {n}",
    inShopWatch: "Watch the fight that did it",
    pair: "x2",
    total: "Total",
  },

  /** the shop screen (screens doc 1 row 5, economy doc section 3) */
  shopUi: {
    today: "{day}'s shelf",
    one: "One of each listing per day.",
    t4Days: "A Tier 4 part shows on Wednesdays and Saturdays.",
    bought: "Bought today",
    needsLevel: "Needs bot level {n}",
    yourLevel: "Your bots are level {n}",
    coins: "{n} coins",
    added: "{name} is on your tool board.",
    forSlot: "Showing {slot} only",
    showAll: "Show all",
    empty: "The shelf is empty today.",
    listingCount: "{n} listings",
  },
} as const;

export type BotsDict = typeof en;

export const STRINGS: { en: BotsDict } = { en };

/** Replace {name} placeholders. A template may omit a placeholder. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

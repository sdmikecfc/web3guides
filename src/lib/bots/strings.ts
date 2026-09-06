/**
 * BATTLE BOTS string tables (week 2: English only).
 *
 * Same mechanism as the proven S7 tables (src/lib/s7/strings.ts): one object
 * per locale with the SAME keys, `en` is the source of truth, and
 * `BotsDict = typeof en` forces any later locale to match every key at
 * compile time.
 *
 * COPY LAWS. Mike, 2026-09-04: "Really go through and make it so a 7 year old
 * can understand it, not so only a no lifer with 10000 hours in the game
 * knows what's going on." So: name the thing, say what it does, say what
 * happens next; the plainest word wins; never a word you then have to
 * explain; ONE word per idea, everywhere; every number carries a unit word;
 * one clause per sentence; a joke may decorate a line but may never be the
 * only place a rule is stated.
 *
 * "Bot" is the game's name. Every SENTENCE says "robot": in 2026 a child
 * hears "bot" and thinks of a fake account.
 *
 * Standing laws: no em-dashes anywhere; never a dollar figure and never the
 * phrase "win $"; never a wallet address, not even a shortened one; no
 * idioms; whole numbers in worked examples; no per cent signs; and never the
 * lone full stop used as a divider (" . "), which every screen reader and
 * every translation memory reads as the end of a sentence.
 *
 * THE ONE WORD PER IDEA, so nothing here drifts back:
 *   quality of a part      stars (1 to 4; the digit in "Spark 3 Legs")
 *   numbers added up       size ("Size 62")
 *   the weekly score       fight points
 *   the buy screen         Parts
 *   your loose parts       your parts
 *   a garage slot          spot
 *   broken and waiting     being fixed
 *   what a hit takes off   life
 *   the free fight         practice
 *   an offline opponent    a saved copy
 *   coins at risk          coins you put in
 *   auto trading           auto trading
 *   one finished trade     a trade
 *   the fight floor        the ring
 *   turning it into coins  sell
 *   the leaderboard        Leaders, and the column is Player
 *
 * Slot words for {slot}: head, body, left arm, right arm, left leg, right
 * leg, weapon (say "body" to players, keep `torso` in code).
 *
 * Templates use {name} placeholders; fill() below replaces them. A
 * placeholder name is vocabulary too: none of them is a retired word.
 */

const en = {
  /* ── the starter copy pack (screens doc section 8, verbatim) ─────────── */
  landing: {
    headline: "Build a robot. Watch it fight.",
    /** THE DOOR SAYS WHAT HAPPENS NEXT (Mike, 2026-09-04). Not "Connect
     * wallet", which tells a player what they are giving and not what they
     * are getting. Three steps: open the site, connect, play. */
    connect: "Connect wallet to play",
    connecting: "Connecting",
    signing: "Signing you in",
    play: "Play",
    starting: "Starting your fight",
    ready: "Your first robot is built already.",
    watch: "Watch a fight",
    sub: "Free to play. You get coins when Doma buys or sells for you.",
  },
  strategy: {
    title: "Turn on auto trading",
    doma: "Open Doma auto trading",
    mcp: "Set it up in your MCP app",
    mcpPrompt: "Set up Buy Low Sell High auto trading on Doma for my wallet.\nWatch 3 tokens I choose.\nTell me when the first trade happens.",
    notSeen: "Auto trading is off. Your garage still works.",
    seen: "Auto trading is on: {kind}. Your helpers are working.",
    same: "Use the same setup",
  },
  garage: {
    title: "Garage No. {n}",
    ready: "Ready. {n} fights left today",
    shop: "Being fixed. {time} left",
    fighting: "Fighting now. Watch",
    empty: "Empty spot. Build",
    notReady: "{n} parts missing",
    full: "Your garage holds 5 robots. Sell one to make room.",
    paper: "Morning Paper",
    quietNight: "Nobody challenged you. Quiet night.",
  },
  build: {
    title: "Build",
    pick: "Pick a {slot}",
    equip: "Put it on",
    save: "Save to spot {n}",
    toBattle: "Take it to a fight",
    tier: "A {t} star robot. Size {size}.",
    tierOne: "A 1 star robot. Size {size}.",
    /** the number is dropped on purpose: it counted sockets (7) while the
     * shop sells cards (5), so "2 parts missing" sent a player looking for
     * two things that one card fills */
    notReady: "Not ready. Add the missing parts.",
    name: "Name your robot",
    shuffle: "Pick for me",
    decalNote: "Stickers only change how it looks.",
    firstCoach: "Your first robot is built already. You have {coins} coins to buy better parts.",
    costsNothing: "Building costs nothing. Only parts cost coins.",
  },
  shop: {
    title: "Today's parts",
    /** the price already prints beside the button, so the button never says it twice */
    buy: "Buy",
    notEnough: "You need {n} more coins.",
    rotates: "New parts arrive every day.",
  },
  part: {
    foundShipment: "Bought on {day}",
    recycledFrom: "Taken off {bot}",
    starter: "Your starting part",
    recycleFor: "Sell for {coins} coins",
  },
  recycle: {
    title: "Sell {bot}?",
    back: "You get these coins:",
    note: "Spot {n} becomes empty. The name is gone for good.",
    /** THE MARKS GO TOO, and the sheet has to say so before the button is
     * pressed. Parts come back as coins, so the coin list reads like a full
     * account of what is being given up; the stars and the patches are the
     * half of it that turns into nothing. A player who finds that out
     * afterwards has been tricked by a screen that told them the truth in
     * the wrong order. */
    marks: "Its stars and patches go with it. They do not come back.",
    confirm: "Sell for {coins} coins",
    keep: "Keep it",
  },
  /**
   * WHAT LEVEL A ROBOT IS ON (src/lib/bots/levels.ts).
   *
   * A robot's level and the fights behind it were both stored and neither
   * was ever drawn, while the whole part ladder hangs off them: the parts
   * screen refuses a 3 star part until one of your robots is level 5, and a
   * 4 star part until one is level 10. A player could read "You need level
   * 5" on a card in the shop and have nowhere in the game to find out what
   * level they were, or how a level goes up.
   *
   * NOTHING HERE COUNTS DOWN AND NOTHING SITS FULL. Level 10 is the last
   * one, so at the top the bar is gone and a sentence takes its place,
   * rather than a full bar standing there for ever pretending there is more
   * to come.
   *
   * The two numbers in the part lines are FILLED from the shipped table
   * (fixtures.ts LEVEL_FOR_TIER), never typed in here, so the day a gate
   * moves these sentences move with it.
   */
  level: {
    title: "LEVEL",
    now: "Level {n}",
    next: "Next is level {n}.",
    going: "Every fight takes you closer to the next level. Winning takes you further.",
    /** said when there is a level but nothing to measure the bar with */
    unknown: "Win fights to go up a level.",
    top: "Level {n} is the top. There is no higher level.",
    topOpen: "This robot can use every part in the game. Its wins still count.",
    need3: "When one of your robots reaches level {n}, you can buy 3 star parts.",
    need4: "When one of your robots reaches level {n}, you can buy 4 star parts.",
    barAria: "Level {n}, part of the way to the next one",
  },
  battles: {
    pickBot: "Pick your robot",
    fight: "Fight",
    challenge: "Challenge",
    needsStrategy: "Turn on auto trading first",
    /** the number is a COUNT of fight points, never a multiplier sign */
    reward: "{n} fight points",
    rewardOne: "1 fight point",
    live: "Fighting now",
    recent: "Just finished",
    watch: "Watch",
    attacksLeft: "{n} fights left today",
    gapHint: "Beat a robot the same size as yours and you get 5 fight points. Beat a bigger one and you get more.",
    twoADay: "Every robot can fight twice a day.",
    stakeLabel: "Coins you put in",
    /** {won} is the doubled number, done for the player */
    stakeSum: "If you win you get {won} coins back.",
    stakeLose: "If you lose, you do not get them back.",
  },
  fight: {
    /** IT NEVER SAYS "WIN". The viewer is as often the robot that lost, and
     * a replay anybody can open belongs to neither of them, so the button
     * said "Share this win" to a player watching their own knockout. */
    share: "Share this fight",
    /** WHERE A PLAYER'S NAME GOES, ON A ROBOT THAT HAS NO PLAYER. A stored
     * fight names the game's own side "House", which the pit header printed
     * straight out, so the robot the player was fighting looked like it
     * belonged to somebody called House. One of the nine is a game robot
     * everywhere else in the game, so it is a game robot here too. */
    gameRobotOwner: "A game robot",
    making: "Making your picture",
    replay: "Watch it again",
    /** THE MOMENT, said big over the ring the instant it happens, while the
     * lights are still blinking. The card under the pit can only ever report
     * it afterwards, and a fight that ends with a quiet line of text under a
     * picture does not feel like a fight that was won. */
    koWord: "Knockout!",
    timeWord: "Time is up!",
    winnerLine: "{winner} wins!",
    /** the result card's headline: both names, so a person who scrolled past
     * the knockout still learns who fought */
    beatLine: "{winner} beat {loser}.",
    /** the WHY behind a drawn fight. It never says "challenged", "defender"
     * or "tie", none of which a seven year old has been taught. */
    tieRule: "Both robots ended the same. The robot that did not start the fight wins.",
  },
  board: {
    tabs: ["Trade points", "Fight points", "Up or down"],
    visit: "Visit",
    noStrategy: "Auto trading is off",
  },
  profile: {
    record: "{w} wins. {l} losses.",
    /** {updown} is already the words: up a lot, up a little, same, down a
     * little, down a lot. There is no per cent sign anywhere in the game. */
    tradingStrip: "Trade points {score}. Money {updown}. {trades} trades in 30 days.",
  },
  card: {
    shareText: "{winner} knocked out {loser}. Watch: {url}",
    /** THE SHARE CARD IS A PORTRAIT, NOT A TABLE. The robot is the picture;
     * these two lines are everything the reader needs beside it. The name is
     * already printed above them, so the sentence says "it". */
    beat: "It knocked out {loser}.",
    stoodUp: "It was still standing when the time ran out.",
  },
  legal: "The people who made this game pay the prizes. Nothing here is promised.",

  /** the prize rules, in five sentences. Never a money amount, never "win $".
   * "Groups" replaces every earlier attempt at the word bracket: both readers
   * failed "players who started with about the same money", because it points
   * at money from before the game that the player never saw. */
  prize: {
    groups: "Players are put into groups. Everyone in your group trades with about the same amount of money.",
    who: "The best fight points in your group win a prize.",
    when: "Prizes go out every Monday.",
    gate: "To win a prize, your trading must not end the week down.",
    check: "A person checks for cheating before any prize goes out.",
  },

  /** THE SEVEN WORDS THE GAME IS ALLOWED TO TEACH, and their one teaching
   * sentence each. Everything else must be understood on sight. Each of these
   * is said ONCE, in the place the word first appears. */
  teach: {
    coins: "Coins are the money inside the game. You buy parts with them.",
    stars: "Stars show how good a part is. 1 star is the worst. 4 stars is the best. The number in the part's name is its stars.",
    size: "Size is a robot's numbers added up. A bigger robot is a stronger robot.",
    matching: "Four body parts with the same name make your robot stronger. Four in the same colour do too.",
    points: "Fight points are your score for the week. The best scores win the prizes.",
    savedCopy: "You fight a saved copy of their robot. That player is not here, and their robot cannot break.",
    beingFixed: "A robot that loses a real fight is being fixed for one day. It cannot fight until it is ready.",
  },

  /* ── sign in (src/app/api/bots/enlist/nonce-store.ts) ──────────────────
   * Every line here is read by a player whose sign in did not go through, so
   * each one says what happened and what to press next, and none of them
   * blames anybody. There is nothing to qualify for: connect, sign once,
   * play. The Discord lines that used to sit here are gone with the gate
   * (Mike, 2026-09-04: three steps to join). */
  enlist: {
    nonceMissing: "We lost your sign in. Press Play again.",
    nonceExpired: "Your sign in took too long. Press Play again.",
    nonceUsed: "That sign in was already used. Press Play again.",
    nonceWrongWallet: "That sign in was for a different wallet. Press Play again.",
    tooManyTries: "Too many tries. Wait a few minutes and try again.",
    /** The sign in ran out while a screen was still open, so buying a part or
     * saving a robot came back with nothing done. Every route that changes
     * something answers the same way, and this is the one sentence a player
     * reads for all of them: what happened, and the one button to press. */
    signedOut: "Your sign in ran out. Press Play again.",
  },

  /* ── week-1 additions (the Build screen chrome; not in the starter pack) ─ */
  nav: {
    wordmark: "BATTLE BOTS",
    garage: "Garage",
    build: "Build",
    shop: "Parts",
    battles: "Fights",
    board: "Leaders",
    aria: "Game sections",
    coinsAria: "Your coins. Coins are the money inside the game.",
    walletAria: "Your player name",
  },
  ui: {
    parts: "YOUR PARTS",
    owned: "you have {n}",
    all: "All",
    onBot: "on this robot",
    buyMore: "Buy more parts",
    yourBot: "YOUR ROBOT",
    /** was "COLOUR AND STICKER". The panel gained the face, the sticker's
     * place, its colour and the number plate, so the title had to stop
     * listing what is in it and say what it is for. */
    color: "HOW IT LOOKS",
    decal: "Sticker",
    total: "Size",
    tierBadge: "{t} STARS",
    tierBadgeOne: "1 STAR",
    pts: "Size {n}",
    notReadyBadge: "NOT READY",
    emptyCount: "{n} parts missing",
    editName: "Edit the name",
    number: "A number after the name",
    noNumber: "No number",
    /** the number is CHOSEN, never typed. A box a player has to think about
     * is the one thing that turns naming your robot into paperwork. */
    numberAdd: "Add a number",
    numberAnother: "A different number",
    firstWord: "FIRST WORD",
    secondWord: "SECOND WORD",
    done: "Done",
    saved: "Saved to spot {n}.",
    /** The wire went away in the middle of a tap. Nothing was bought, nothing
     * was lost and nobody did anything wrong, so the sentence says the one
     * useful thing and blames nobody. */
    tryAgain: "That did not work. Try it again.",
    bayLabel: "Spot {n}",
    lore: "Story",
    closeLore: "Close",
    garageStub: "Your garage has five spots. Pick one and build a robot.",
    landingGarage: "Open your garage",
    /** the nine readout stats, in readout order (screens doc 2.1 rows 3 to 11).
     * There is no short form table any more: the long words fit, and a short
     * form is the one thing a reader cannot look up. */
    stat: {
      speed: "Speed",
      strength: "Strong",
      dodge: "Dodge",
      damage: "Punch",
      block: "Block",
      health: "Life",
      luck: "Luck",
      accuracy: "Aim",
      attackSpeed: "Swings",
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
    tierWord: "{t} stars",
    tierWordOne: "1 star",
  },

  /* ── week-2 additions: matching, colours, the garage, the shop ────────── */

  /** the MATCHING PANEL under the readout (the guide, "Matched sets") */
  set: {
    title: "MATCHING",
    family: "{family}: {n} of 4",
    noFamily: "Same name: 0 of 4",
    color: "Same colour: {n} of 4",
    bonus: "Match reward: every number goes up by {n} in a fight",
    none: "No match yet.",
    weapon: "The weapon never counts. Only the four body parts do.",
    /** "Spark 3, light green" on every card (maker and number, then colour) */
    line: "{family}, {color}",
    /** a weapon carries no maker set and no colour */
    weaponLine: "Weapon. It never matches.",
    /** the key name is week-2's; the words are the ADR-0141 ones */
    noPaint: "no colour",
    /** the read-only colour line on the Build screen (ADR-0141) */
    allSame: "All four the same colour: {yes}",
    yes: "yes",
    no: "no",
    /** THE COLOURS AS PROGRESS, not as a number. Four swatches, one per body
     * part, read left to right, with the odd one out called by its own name
     * so a player knows which card to go and buy. */
    pipsAria: "The colour of each body part",
    oneToGo: "One part is not {color}: the {slot}. Change it and all four match.",
    allMatch: "All four body parts are {color}. They match.",
    /** "Head, light green". "{slot} is {color}" read "Arms is light green"
     * on two of the four rows; the comma is the same shape the card line
     * already uses, and it survives a plural. */
    slotColor: "{slot}, {color}",
    empty: "empty",
  },

  /** the eight colours, as the player reads them. mint and moss are both
   * green, so one of the pair takes two words; coral reads pink on screen,
   * which is why it is called pink. The swatch is always drawn beside the
   * word, so a reader who cannot name a colour still sees it. */
  paintName: {
    mint: "light green",
    coral: "pink",
    butter: "yellow",
    sky: "blue",
    lilac: "purple",
    moss: "green",
    cream: "white",
    ink: "black",
  },

  /** the garage screen (screens doc 3) */
  garageUi: {
    street: "Sprocket Row",
    door: "No. {n}",
    walkLeft: "Ten doors to the left",
    walkRight: "Ten doors to the right",
    yourDoor: "Your door",
    neighbour: "Garage No. {n} is not open yet.",
    /** the status chips (canvas tag and DOM chip share these). A robot
     * fights twice a day, so {n} is never more than 2. */
    chip: {
      ready: "Ready, {n} fights left",
      shop: "Being fixed, {time}",
      battle: "Fighting now, watch",
      notReady: "Parts missing",
      empty: "Empty spot, build",
    },
    bays: "SPOTS",
    toolBoard: "YOUR PARTS",
    spares: "{n} spare parts",
    sparesOne: "1 spare part",
    noSpares: "No spare parts. There are more to buy.",
    newBot: "New robot",
    record: "{w} wins, {l} losses",
    lastFights: "LAST 5 FIGHTS",
    noFights: "No fights yet.",
    beat: "beat {bot}",
    lostTo: "lost to {bot}",
    watch: "Watch",
    recycle: "Sell",
    masthead: "SPROCKET ROW MORNING PAPER",
    paperChip: "Paper",
    partsChip: "Parts",
    readAll: "Read the paper",
    shopLink: "Buy parts",
    crewTitle: "{kind} helpers",
    crewFills: "{n} trades today",
    crewCoins: "{n} coins today",
    crewTokens: "Watching {tokens}",
    changeStrategy: "Change auto trading",
    speech: "A trade! {n} coins.",
    speechAdded: "Added {n} coins.",
    strategyKind: {
      blsh: "Buy low, sell high",
      position: "Buy and keep",
      limit: "Buy at my price",
    },
    putOn: "Put it on spot {n}",
    putOnAny: "Put it on a robot",
    /**
     * THE TWO LINES A REAL GARAGE NEEDS AND THE DEMO DOES NOT.
     *
     * A loose part is put on and taken off in the browser in the demo, and a
     * signed in player's parts live in rows. There is one route that puts a
     * card on a robot and it saves the whole robot with it (the build
     * screen), and there is no route at all that turns ONE loose card back
     * into coins: the only thing that pays coins back is selling a whole
     * robot. So the real garage sends the player to the screen that can do
     * it, and says plainly that the other thing is not there yet, rather
     * than moving a card in a browser and losing it on the next reload.
     */
    buildOn: "Open spot {n} to put it on",
    sellNote: "One part on its own cannot be sold yet. To get coins back, sell a whole robot from its own page.",
    pickBay: "Which robot?",
    noBotForSlot: "No robot needs a {slot} right now.",
    swapped: "{name} is on the robot in spot {n}.",
    recycledPart: "Sold {name} for {coins} coins.",
    recycledBot: "Sold {bot} for {coins} coins. Spot {n} is empty now.",
    repairLine: "Fixed and ready in {time}.",
    bayDot: "Spot {n}",
    inShopWatch: "Watch the fight it lost",
    pair: "2 of these",
    total: "Size",
  },

  /** the Parts page (screens doc 3.3, economy doc section 3, ADR-0141) */
  shopUi: {
    yard: "PARTS TO BUY",
    title: "Today's parts",
    /**
     * THE ONE LINE THE SCREEN OWES A STRANGER. The band above it draws a
     * truck tipping its load out into a fenced yard; this says what the
     * picture means, in one sentence a seven year old reads without help.
     * It is a RULE, not today's news: the line under it is the day's own
     * flavour ("A crane put it down before the sun came up.") and changes,
     * this one never does. So it must not name the truck either: one day in
     * seven the flavour line is "A truck brought it very early." and the two
     * lines read as a stutter.
     */
    yardLine: "A big pile of new parts arrives here every morning.",
    rowT1: "1 STAR, 8 PARTS",
    rowT2: "2 STARS, 4 PARTS",
    rowT3: "3 STARS, 2 PARTS",
    rowT4: "4 STARS, 1 PART",
    rowRack: "WEAPONS, 1 TODAY",
    dayColor: "Today's colour",
    colorOf: "{stars} today: {color}",
    comesBack: "Every colour comes back every 8 days.",
    t4Week: "This week: {color}",
    t4Today: "Only one 4 star part today: {name}, {color}.",
    t4Tomorrow: "Tomorrow: 4 star {slot}.",
    t4Weapon: "Today's 4 star part is a weapon. Weapons have no colour.",
    t4Again: "This one comes back on {day}.",
    oncePerDay: "Buy each part once a day.",
    samePlace: "Everyone sees the same parts today. Nobody can take yours first.",
    nextIn: "New parts in {time}",
    landed: "New parts are here. Reload the page.",
    bought: "You bought this today",
    needsLevel: "You need level {n}. Win fights to go up.",
    levelCure: "Win fights to go up a level.",
    yourLevel: "You are level {n}.",
    coins: "{n} coins",
    added: "{name} is with your parts.",
    keepsColor: "A part keeps the colour it came in. You cannot paint it.",
    wantSet: "Want the match reward? Buy four body parts in one colour.",
    emptyRow: "No parts in this row today.",
    /** when the player's OWN colour filter emptied the row, which the empty
     * line above used to blame on the day */
    filterCure: "No {colour} parts in this row. Tap All colours to see them all.",
    empty: "No parts today.",
    allColors: "All colours",
    colorFilter: "Show one colour",
    calendar: "4 STAR PARTS THIS WEEK",
    today: "Today",
  },

  /* ── week-2 carry-overs: the landing, auto trading, the helper, the locks ─ */

  /** the landing (screens doc 7, row 0:00): the ring replaying in the frame */
  landingUi: {
    recent: "A real fight",
    demo: "A fight to show you",
    /** the label over the ring: who is in it */
    versus: "{a} against {b}",
    replaying: "Playing again",
    opening: "Opening the ring",
    /** THE THREE STEPS TO PLAY, under the doors, in the plainest words in
     * the game (Mike, 2026-09-04). They are the real steps, in order, and
     * there is no fourth one: no Discord, no bot command, no build screen
     * before the first fight. If a step ever has to be added here, that is
     * the bug, not the copy. */
    how: [
      "Come to this page. You are here.",
      "Connect your wallet. One tap, nothing to pay.",
      "Press Play. Your robot is built already. Watch it fight.",
    ],
    watchFree: "Anyone can watch. No wallet needed.",
  },

  /** the auto trading page (screens doc 1 row 2, 7 row 0:30) */
  strategyUi: {
    lead: "Your robots need coins. You get coins when Doma buys or sells for you. Turn it on here, or set it up in your MCP app. Your garage keeps working either way.",
    domaTitle: "On Doma",
    domaBody: "Pick a setup on Doma. Every trade it makes pays coins into your garage.",
    newTab: "Opens in a new tab.",
    mcpTitle: "With an MCP app",
    mcpBody: "Only for people who use an MCP app. Most people use the button above. Paste the address into your MCP app, then send the words below.",
    urlLabel: "MCP address",
    promptLabel: "The words to send",
    copy: "Copy",
    copied: "Copied.",
    copyFailed: "Copying did not work. Mark the text and copy it yourself.",
    status: "HOW IT IS GOING",
    checking: "Checking your auto trading.",
    checksEvery: "We check again every 30 seconds.",
    noCheck: "We cannot check this yet. Your garage keeps working.",
    back: "Back to the garage",
    later: "You can do this later. Nothing is locked.",
  },

  /** the helper (screens doc 7): advances on real events, never a timer */
  coach: {
    firstBot: "Your first robot is built already. You have {coins} coins to buy better parts.",
    firstBotAction: "Build it",
    strategy: "Turn on auto trading.",
    strategyBody: "You get coins when Doma buys or sells for you. Your garage works without it too.",
    strategyAction: "Open",
    skip: "Skip",
    stepOf: "Step {n} of {count}",
    aria: "Helper",
  },

  /** the locks for a player with auto trading off (screens doc 7): the art
   * stays bright, the reason is plain, and the chip is a door to the page
   * that turns it on */
  lock: {
    open: "Turn it on",
    what: {
      foreman: "The harder fight",
      bigRig: "The hardest fight",
      pvp: "Fighting other players",
    },
  },

  /* ── week-3: the words that make a robot THEIRS ───────────────────────── */

  /**
   * THE FIRST MEETING. Mike, 2026-09-05: "Can someone look at it and think
   * 'aww that's so cute, I want to upgrade this guy' and feel ownership over
   * how cute it is?" A player arrives with a robot already built, and until
   * now it simply appeared in a numbered box. These are the lines for the
   * moment it wakes up and turns out to belong to them.
   *
   * The card never blocks the screen and it goes away for good in one tap
   * (the coach law), so nothing here can be said twice.
   */
  meet: {
    title: "Meet your robot",
    woke: "It woke up when you opened the door.",
    called: "Somebody called it {name}.",
    keep: "I like that name",
    rename: "Pick another name",
    /** said back to them, warmly, whichever of the two they pressed. The
     * greeting above it carries the name, so this line says "it": the name
     * printed twice in two lines read like a form letter. */
    yours: "It is yours. It is standing in spot {n}, waiting for you.",
    hello: "Hello, {name}.",
  },

  /**
   * HOW EACH ROBOT IS DOING, in one warm line. Five robots in five boxes
   * read as five copies of one robot until each one is doing something of
   * its own, so every spot says what its robot is up to today. Each line
   * names the robot, because the name is the thing the player chose.
   */
  mood: {
    won: "{name} won its last fight. It is standing very straight.",
    lost: "{name} lost its last fight. It wants to try again.",
    fixed: "{name} is being fixed. It is having a quiet day.",
    fighting: "{name} is in the ring right now.",
    ready: "{name} is ready. It keeps looking at the door.",
    first: "{name} has not fought yet.",
    building: "{name} is not finished. Some parts are missing.",
    empty: "Spot {n} is empty. There is room for one more robot.",
  },

  /**
   * MAKING IT YOURS (the joint law, ADR-0141): a face, one sticker in one of
   * three places, and the colour it wears. Nothing here is bought. A colour
   * arrives with a part and stays for life, so the only colours offered are
   * the ones the robot is already wearing; a face is free or it is earned;
   * and every mark on the body was won in a fight, never picked.
   *
   * The lines that say HOW a thing is earned are not here. They live once, on
   * the row for the thing itself (src/lib/bots/look.ts FACES, STICKERS,
   * SPOTS, MARK_EARN), so a face and its one sentence can never drift apart.
   */
  look: {
    face: "Face",
    sticker: "Sticker",
    /** where the sticker goes. "Spot" is the word for a garage space, so it
     * is never reused here: a player who reads "spot" must think of one thing
     * only. */
    place: "Where it goes",
    stickerColor: "Sticker colour",
    plate: "Number plate",
    /** the number is part of the NAME, so the plate never invents one: it
     * says what the robot is called and sends the player to the name */
    plateOn: "Its plate says {n}.",
    plateNone: "It has no number. Add one to its name.",
    plateEdit: "Change the number",
    none: "No sticker",
    /** shown under a face nobody has earned yet, above its own earn line */
    locked: "Not yet",

    /* ── THE HAT ROW ─────────────────────────────────────────────────────
     * A hat is the ONE thing on this panel that is not free, and the way it
     * is not free is that it cannot be bought at all: it turns up when a
     * robot beats the biggest robot in the yard. So the row is not on the
     * screen until the player has one. A row of six padlocks that no amount
     * of playing the shop can ever open would teach exactly the wrong thing
     * about a game with no paint for sale.
     *
     * The colour is part of the name ("blue bow"), because a hat keeps the
     * colour it turned up in the way a part does, and a player who has won
     * two bows has to be able to say which one they mean. */
    hat: "Hat",
    /** "{color} {kind}", the only place the two words are put together */
    hatName: "{color} {kind}",
    noHat: "No hat",
    /** the first time a hat is ever there, above the row. It says what the
     * ROBOT did, and it says the one rule, so nobody goes looking for a shop */
    foundHat: "Your robot found a hat. Hats are won in fights. They are never for sale.",
    /** said back when one goes on */
    hatOn: "{hat}. Your robot is wearing it.",
    /** the three buttons under the rows */
    pickForMe: "Pick for me",
    surprise: "Surprise me",
    plain: "Back to normal",
    /** said back after any of the three, so a button that changes four things
     * at once still says what it did */
    done: "Your robot is looking at you.",
    /** the one line the whole panel teaches */
    note: "A face and a sticker are free. They never change how it fights.",
    /** the first meeting's one tap row */
    meet: "Give it a face",
    /** an earned face that has just this moment opened up */
    unlocked: "{face} is ready to wear.",
    wear: "Put it on",
    /** the only failure the player is ever shown. A wallet that is not
     * connected and a spot the server has not met are both silent: the robot
     * keeps the face, and neither is something the player did wrong. */
    notSaved: "That did not save. Try it again.",
  },

  /**
   * THE PROUD MOMENTS. Each one is shown once, names the robot, and says
   * what the robot did, never what the player did: the robot is the thing
   * they are proud of. A moment is read off the same state the screen
   * renders with, so none of them can fire for something that did not
   * happen.
   */
  proud: {
    firstWin: "{name} won a fight. Show it to somebody.",
    firstWinAction: "See the fight",
    /** the two lines that now hand something over. A colour match opens the
     * Wink face and a 4 star part opens the Stars face, so the moment that
     * says what the robot did also says what it may now wear, and the button
     * goes straight there. */
    firstMatch: "Every body part on {name} is {color} now. They match in every fight, and {name} can wear the Wink face.",
    firstBest: "{name} is wearing a 4 star part. A part does not get better than that, and {name} can wear the Stars face.",
    faceAction: "Try the face",
    thanks: "Thanks",
  },

  /** the maker's one line of character, shown when most of the robot came
   * from one maker, so a player can see what they have been collecting */
  maker: {
    mostly: "Mostly {maker} parts.",
  },

  /**
   * WHAT IT EARNED: the list on a robot's own page.
   *
   * Every row is a thing the ROBOT did, so no row can ever be bought. A row
   * is lit when the server's own rows say it happened and locked when they
   * do not, and a locked row still prints the one line that says how it is
   * earned, because a padlock with no reason is a tease and a seven year old
   * cannot guess.
   *
   * THE COUNTS ARE NOT REPEATED HERE. markWords() in src/lib/bots/look.ts
   * already says them in one line above the list, and a number printed twice
   * on one card is a number that can disagree with itself. The earn lines
   * are not repeated either: they live once, beside the ladder they belong
   * to, in look.ts.
   *
   * NOTHING ON THIS LIST STOPS. The chest star row is drawn to six steps and
   * the plate then prints the win count, and the patches are drawn to three
   * and then counted in words, so the line above the list keeps going after
   * the drawing runs out.
   */
  earned: {
    title: "WHAT IT EARNED",
    star: "Chest stars",
    patch: "Stitched patches",
    cuff: "Cuff bands",
    sparkle: "Sparkly eyes",
    wink: "Winking face",
    starEyes: "Star eyes",
    hat: "A hat",
    crown: "Gold crown",
    nothing: "{name} has not earned a mark yet. Its first win puts a star on its chest.",
    /** shown while the page has no wallet to ask about, so nothing is claimed */
    connect: "Connect your wallet to see what this robot has earned.",

    /** the cards it has won. A card is a keepsake, never a score. */
    cards: "ITS CARDS",
    firstWin: "First win card",
    firstWinLine: "{name} beat {bot}. That was its first win against another player.",
    crownCard: "Champion of the week card",
    crownCardLine: "{name} was the best robot of the week.",
    noCards: "No cards yet. The first fight it wins against another player makes one.",
  },

  /**
   * THE MORNING PAPER'S NEW LINES: a mark gained since the paper was last
   * read. The paper already tells a player what happened while they were
   * away; a star that appeared on a robot's chest overnight is exactly that,
   * and without a line it is a change nobody announced.
   *
   * Every line names the robot and says what the ROBOT has, never what the
   * player has. The win count rides along because the star row runs out of
   * drawn steps and the number does not.
   */
  news: {
    /** the very first star is the very first win, so it gets its own sentence
     * rather than the counting one, which would have read "1 wins" */
    firstStar: "{name} won its first fight. There is a star on its chest now.",
    star: "{name} has a new star on its chest. That is {n} wins.",
    stars: "{name} has {x} new stars on its chest. That is {n} wins.",
    goldStar: "{name} has a gold star on its chest. That is {n} wins.",
    patch: "{name} has a new stitched patch.",
    patches: "{name} has {n} new stitched patches.",
    /** a hat is the only thing on this list that arrives from ONE fight and
     * cannot be worked towards, so the paper says which one turned up */
    hat: "{name} beat the biggest robot and found a {hat}.",
  },
} as const;

export type BotsDict = typeof en;

export const STRINGS: { en: BotsDict } = { en };

/** The two doors on the auto trading page. Constants, not copy. */
export const STRATEGY_LINKS = {
  doma: "https://app.doma.xyz/auto-trading",
  mcp: "https://mcp.doma.xyz/mcp",
} as const;

/* ── the locks for a player with auto trading off (screens doc 7) ──────────── */

/** What a wallet with auto trading off cannot start yet. The easiest fight is
 * never on this list: that path fights the easy game robot twice a day. */
export type LockTarget = "foreman" | "bigRig" | "pvp";

const LOCKED_WITHOUT_STRATEGY: ReadonlySet<LockTarget> = new Set<LockTarget>(["foreman", "bigRig", "pvp"]);

/**
 * The plain reason a thing is locked, or null when it is open. ONE helper so
 * the fights page, the helper and any later surface say the same words: the
 * art stays bright, only the button changes (screens doc 4.1, 7).
 */
export function lockReason(target: LockTarget, hasLiveStrategy: boolean): string | null {
  if (hasLiveStrategy) return null;
  return LOCKED_WITHOUT_STRATEGY.has(target) ? en.battles.needsStrategy : null;
}

/** "3 stars", and "1 star" when the number is 1. One helper so no screen has
 * to remember that one star is never "1 stars". */
export function starWord(stars: number): string {
  return stars === 1 ? en.ui.tierWordOne : fill(en.ui.tierWord, { t: stars });
}

/** "1 win, 0 losses". Four screens printed "1 wins" before this helper: a
 * template cannot count, so the counting lives here, once. */
export function winLossWords(wins: number, losses: number): string {
  return `${wins} ${wins === 1 ? "win" : "wins"}, ${losses} ${losses === 1 ? "loss" : "losses"}`;
}

/** "5 fight points", and "1 fight point" when the number is 1. */
export function fightPointWord(points: number): string {
  return points === 1 ? en.battles.rewardOne : fill(en.battles.reward, { n: points });
}

/** "3 spare parts", and "1 spare part" when the number is 1. The garage
 *  printed "1 spare parts" in two places before this helper. */
export function spareWord(n: number): string {
  return n === 1 ? en.garageUi.sparesOne : fill(en.garageUi.spares, { n });
}

/** Replace {name} placeholders. A template may omit a placeholder. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

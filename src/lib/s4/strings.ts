/**
 * Launch Wars Season 4 — i18n STRING TABLES (Phase 1: landing + hero + rules).
 *
 * One object per locale (en / ko / zh) with the SAME keys, grouped by surface
 * (hero / landing / rules / common). `en` is the source of truth and its text
 * reproduces the current English pages EXACTLY, so a visitor with no cookie
 * renders byte-identical output. `S4Dict = typeof en` forces ko and zh to match
 * every key and function signature at compile time.
 *
 * MECHANISM
 * - Static copy is a plain string.
 * - Copy that interpolates a THEME token (Bounty, Gold, contract, team, agent,
 *   team names) is a function `(w: TW) => string`. The token is passed in and
 *   stays in place, so the theme seam still works and brand/currency tokens
 *   stay English in every locale (per the S4 rules).
 * - Copy with embedded interactive JSX (a <Cmd>, a <Link>, a styled <span>) is
 *   split into translatable fragments (pre / post, or seg2 / seg3 for two
 *   tokens). The page assembles the JSX and drops the fixed token between the
 *   translated fragments, so each locale controls word order around it.
 *
 * TRANSLATION RULES (kept English on purpose in ko/zh): "Launch Wars",
 * "THE HIT LIST", the team display names, "Doma", "Bounty", "Gold", "Discord",
 * "Web3Guides", domain names, the /assassin commands, channel names, the tier
 * names (Contractor..Kingpin), and the arcade game names. No em-dashes anywhere.
 * Prices and numbers stay as digits.
 */
import type { Theme } from "./theme";

/** Theme tokens threaded into interpolated copy (stay English in every locale). */
export type TW = {
  points: string; // Bounty
  play: string; // Gold
  contract: string; // contract
  contracts: string; // contracts
  agent: string; // agent
  team: string; // team
  teams: string; // teams
  team0: string; // team display name (alpha)
  team1: string; // team display name (beta)
  team2: string; // team display name (gamma)
  cap: number; // arcade daily Bounty cap (GAME_DAILY_POINTS_CAP)
};

/** Build the token bag from the active theme + the arcade cap. */
export function words(theme: Theme, cap: number): TW {
  return {
    points: theme.points,
    play: theme.playCurrency,
    contract: theme.target.singular,
    contracts: theme.target.plural,
    agent: theme.player.singular,
    team: theme.team.singular,
    teams: theme.team.plural,
    team0: theme.teams[0]?.name ?? "",
    team1: theme.teams[1]?.name ?? "",
    team2: theme.teams[2]?.name ?? "",
    cap,
  };
}

/** Plain-string hero bundle passed to the (client) HitListHero. */
export type HeroStrings = {
  tagline1a: string;
  tagline1b: string;
  taglineSub: string;
  ledgerPoolLabel: string;
  ledgerOf: string;
  cdBriefingLabel: string;
  cdEndLabel: string;
  cdDoneLabel: string;
  cdDoneValue: string;
  ctaJoin: string;
  ctaPlay: string;
  ctaView: string;
};

// ── EN (source of truth: matches the current pages verbatim) ─────────────────

const en = {
  common: {
    statusBoard: "Status Board",
    linkDiscord: "Link your Discord",
    openArcade: "Open the arcade",
  },

  hero: {
    tagline1a: "Three teams. Five contracts.",
    tagline1b: "Every closed contract pays.",
    taglineSub: (w: TW) =>
      `Hold a featured domain from $5. Holding earns ${w.points} every day. Close contracts, climb the ledger, get paid at season end.`,
    ledgerPoolLabel: "PRIZE POOL UNLOCKED",
    ledgerOf: "of",
    cdBriefingLabel: "BRIEFING OPENS IN",
    cdEndLabel: "SEASON ENDS IN",
    cdDoneLabel: "SEASON",
    cdDoneValue: "COMPLETE",
    ctaJoin: "JOIN THE BRIEFING",
    ctaPlay: "PLAY THE ARCADE",
    ctaView: "VIEW THE HIT LIST",
  },

  landing: {
    signUp: "Sign up",
    arcadeBtn: "Arcade",

    howItWorksEyebrow: "How it works",
    howItWorksTitle: "Three steps to the job.",
    steps: [
      {
        title: "Get drafted.",
        body: (w: TW) =>
          `You join and the Agency drops you on a balanced team, one of ${w.team0}, ${w.team1}, or ${w.team2}. Want a different era? Switch once with /assassin team, then it locks.`,
      },
      {
        title: "Hold a domain.",
        body: (w: TW) =>
          `Buy any featured domain from $5 and just hold it. Holding earns you ${w.points} every day, on every contract you hold. ${w.points} is your score.`,
      },
      {
        title: "Play and post.",
        body: (w: TW) =>
          `Play the arcade, gear up your ${w.agent}, post about the season. Every ${w.contract} that closes unlocks more of the pool for everyone.`,
      },
    ],

    prizeEyebrow: "The prize",
    prizeTitle: "$500 unlocks piece by piece.",
    prizeWeek1Bold: "Week 1 pool: $500.",
    prizeWeek1Rest: " More contracts drop in Week 2, and the pool grows with them.",
    tiersLabel: "Tiers:",
    tiersRest: (w: TW) =>
      ` hold $5+ in more ${w.contracts} to rank up through five tiers, Contractor, Operative, Specialist, Cleaner, Kingpin. Each tier past the first adds 5% to your daily ${w.points}, up to +20% at Kingpin.`,

    currenciesEyebrow: "The two currencies",
    currenciesTitle: (w: TW) => `${w.points} and ${w.play}. That is all.`,
    bountyCardSub: "Your score. It decides your payout.",
    bountyCardBody: (w: TW) =>
      `You earn ${w.points} every day for holding, plus a little for posting and playing. More ${w.points} means a bigger cut of the pool at season end. This is the one that pays.`,
    goldCardSub: "Your gear budget. Just for fun.",
    goldCardBody: (w: TW) =>
      `You earn ${w.play} from the arcade and spend it on your ${w.agent}'s gear and looks. ${w.play} never turns into cash or ${w.points}. It just makes you look good.`,

    teamsEyebrow: "The teams",
    teamsTitle: "Three eras. You get drafted.",
    teamsIntroPre:
      "You do not pick. When you join, you are auto-assigned to whichever team needs numbers, so the sides stay fair. If you want a different era, switch once with ",
    teamsIntroPost: ", then your team locks for the season.",
    teamCards: [
      { era: "THE PAST · EST. 1887", line: "Cowgirls of the old West. First to the draw, first to the bounty." },
      { era: "THE FUTURE · EST. 2087", line: "Tech assassins from 2087. They see the whole job before it starts." },
      { era: "THE PRESENT · EST. NOW", line: "Suits working right now. Clean work, no loose ends." },
    ],

    agentEyebrow: (w: TW) => `Your ${w.agent}`,
    agentTitle: "Every combo is a different assassin.",
    agentBody: (w: TW) =>
      `Playing earns ${w.play}. ${w.play} buys their gear: 🛡️ Armor, 🏍️ Ride, 🛠️ Gadgets. Every gear combination is a different assassin, a girl and a guy, and every look you unlock is yours to keep and wear on the board.`,

    arcadeEyebrow: "The arcade",
    arcadeTitle: "Four jobs. One thumb.",
    gameLines: [
      "Ride the main street on horseback. Clear the saloons, drop the wagons.",
      "Hold the main street while the outlaw gangs circle in.",
      "You are the wheel-woman. Drop the smoke and lose the chasers.",
      "Ride a night bike through neon streets to the extraction point.",
    ],
    playNow: "Play now",
    arcadeCaption: (w: TW) =>
      `About a minute each, scored once a day, practice any time. Games pay ${w.play} plus a little ${w.points}. Holding stays the main engine.`,

    faqEyebrow: "FAQ",
    faqTitle: "Quick answers.",
    fullRules: "Full rules",
    faq: [
      {
        q: (_w: TW) => "Do I need to be good at games?",
        a: (w: TW) => `No. Holding earns most of the ${w.points}. Games are the fun on top.`,
      },
      {
        q: (w: TW) => `What does closing a ${w.contract} mean?`,
        a: (w: TW) =>
          `A ${w.contract} closes when its domain reaches its launch target and bonds. Closed ${w.contracts} graduate on Doma and unlock an equal share of the $500 pool for everyone.`,
      },
      {
        q: (_w: TW) => "When do I get paid?",
        a: (w: TW) =>
          `At season end. The top teams by ${w.points} split the pool, and your cut is your share of your team. You need a $5 hold to qualify.`,
      },
      {
        q: (_w: TW) => "What if my team loses?",
        a: (w: TW) =>
          `Second and third place teams still take smaller shares. And every ${w.contract} that closes unlocks more of the pool for the whole board.`,
      },
    ],

    footerMap: "The Map",
    footerAlreadyPlaying: "Already playing?",
  },

  rules: {
    h1: "The Rules",
    headerIntro:
      "Everything about the season on one page. Short, plain, and complete. If a question is not answered here, ask in Discord and we will add it.",

    tocGame: "The game",
    tocPrize: "The prize",
    tocEarning: (w: TW) => `Earning ${w.points}`,
    tocAgent: (w: TW) => `Your ${w.agent}`,
    tocDaily: "Daily battle",
    tocDuels: "Duels and bets",
    tocFair: "Fair play",
    tocFaq: "FAQ",

    // 01 · The game
    s1Kicker: "Start here",
    s1Title: "The whole game in one line.",
    s1Panel: (w: TW) =>
      `Buy and hold featured domains, the ${w.contracts}, from $5. Holding earns 💰 ${w.points} every day. A ${w.contract} closes when its domain reaches its launch target. Only closed ${w.contracts} pay.`,
    s1P: (w: TW) =>
      `That is the spine of the season. Everything else on this page is detail: the pool, the ${w.teams}, the arcade, the battles. If you only do one thing, hold what you believe in and let the days pay you.`,
    s1NewHere: "New here",
    s1Bullet1Pre: "Join the ",
    s1Bullet1Post: (w: TW) => `. You get drafted onto a ${w.team} on arrival.`,
    s1Bullet2Pre: (w: TW) => `Pick a ${w.contract} on the `,
    s1Bullet2Post: (_w: TW) => " and hold from $5.",
    s1Bullet3Pre: "Already holding? ",
    s1Bullet3Post: ".",

    // 02 · The prize
    s2Kicker: "The pool",
    s2Title: "The pool unlocks piece by piece.",
    s2Week1Bold: "Week 1 pool: $500.",
    s2Week1Rest: (w: TW) => ` More ${w.contracts} drop in Week 2, and the pool grows with them.`,
    s2P2: (w: TW) =>
      `The pool unlocks in equal slices. Every ${w.contract} that closes unlocks one slice for everyone, on every ${w.team}. If half the ${w.contracts} close, half the pool is unlocked. If every ${w.contract} closes, the whole pool pays out. Only closed ${w.contracts} pay.`,
    s2P3: (w: TW) => `At season end, the top three ${w.teams} by total ${w.points} split the unlocked pool:`,
    s2P4: (w: TW) =>
      `Your personal cut is your share of your ${w.team}'s ${w.points}, counted among teammates holding $5 or more. A bigger share of your ${w.team} means a bigger slice of its winnings.`,
    s2P5Pre: "Your projected payout is private. Run ",
    s2P5Post: " in Discord to see where you stand, any time.",

    // 03 · Teams
    s3Kicker: "Sides",
    s3Title: (w: TW) => `Three ${w.teams}. You get drafted.`,
    s3Bullet1: (w: TW) =>
      `When you join, you are auto-assigned to whichever ${w.team} needs numbers, so the sides stay balanced.`,
    s3Bullet2Pre: "Want a different side? Switch once with ",
    s3Bullet2Post: (w: TW) => `. After that your ${w.team} is locked for the season.`,
    s3Bullet3: (w: TW) =>
      `Every point of ${w.points} you earn pushes your ${w.team} up the standings. Your teammates share your fate.`,

    // 04 · Earning Bounty
    s4Kicker: "The score",
    s4Title: (w: TW) => `Three ways to earn 💰 ${w.points}.`,
    s4Intro: (w: TW) =>
      `${w.points} is your score and your claim on the pool. It comes from exactly three places. Nothing else moves it. Holding is the engine, the other two are the extras.`,
    s4HoldLabel: "1 · HOLD",
    s4HoldTitle: "The engine. Automatic, every day.",
    s4HoldBody: (w: TW) =>
      `Every day you earn the full 50 ${w.points} per $5 on your first $25 held, so $25 pays 250 a day before tier and freshness. Above $25 you keep earning at a quarter of that rate, up to your ceiling. Your ceiling starts at $100 and rises $10 for every ${w.contract} you hold at $5 or more, up to $150, so spreading across all five lifts you to $150 and about 562 a day. Holding past your ceiling helps a ${w.contract} bond but adds no more daily ${w.points}. Bigger holders earn more, pulled onto the pricey ${w.contracts}, but with diminishing returns so no one runs away. Held means your total across every ${w.contract}. No claiming, no check-ins.`,
    s4HoldFresh: (w: TW) =>
      `Newer ${w.contracts} pay more per $5. A just listed ${w.contract} pays up to double, 100 per $5 on day one, easing back to 50 over about 10 days. Spreading onto fresh ${w.contracts} pays better than camping the oldest one.`,
    s4HoldTableHeld: "Held",
    s4HoldTableDaily: "Daily base",
    s4HoldTableCaption: "Before your tier and freshness multipliers.",
    s4HoldTableCapped: "capped",
    s4TiersLabel: (w: TW) => `TIERS: HOLD MORE ${w.contracts.toUpperCase()}, MULTIPLY IT`,
    s4TiersBody: (w: TW) =>
      `Your tier is how many different ${w.contracts} you hold $5 or more in. Every tier past the first adds 5% to your daily hold ${w.points}: Tier 1 Contractor x1.00, Tier 2 Operative x1.05, Tier 3 Specialist x1.10, Tier 4 Cleaner x1.15, Tier 5 Kingpin x1.20 at five or more. Spreading the board ranks you up and pays every day.`,
    s4PostLabel: "2 · POST",
    s4PostTitle: "The megaphone. One a day counts.",
    s4PostBullet1Pre: "Drop your X post link in ",
    s4PostBullet1Post: ".",
    s4PostBullet2: (w: TW) =>
      `One counted post a day. It starts at 30 ${w.points} and can reach 170 as its reach grows.`,
    s4PostBullet3: (w: TW) => `It must mention the season or a ${w.contract}, and you need a $5+ hold.`,
    s4PlayLabel: "3 · PLAY",
    s4PlayTitle: "The fun on top.",
    s4PlayBody: (w: TW) =>
      `Every run pays 🔶 ${w.play} plus a little ${w.points}. Play all four games for up to ${w.cap} ${w.points} a day. ${w.play} is the real arcade reward, and ${w.points} from games is the smallest source. Holding is the engine.`,

    // 05 · Gold
    s5Kicker: "The fun money",
    s5Title: (w: TW) => `🔶 ${w.play} buys the look, never the payout.`,
    s5P1: (w: TW) =>
      `${w.play} is the fun currency. You earn it by playing the arcade and clearing quests. You spend it on your ${w.agent}: gear, skins, stat levels, duel stakes, and bets.`,
    s5Panel: (w: TW) =>
      `${w.play} never converts to cash or ${w.points}. It cannot touch the pool. If it shines, it is ${w.play}. If it pays, it is ${w.points}.`,

    // 06 · Your agent
    s6Kicker: "The closet",
    s6Title: "Every combo is a different assassin.",
    s6P: (w: TW) =>
      `${w.play} buys gear in three slots: 🛡️ Armor, 🏍️ Ride, 🛠️ Gadgets. Every gear combination unlocks a different assassin, in a girl and a guy version. Wear either. Every look you unlock is yours to keep.`,

    // 07 · Daily battle
    s7Kicker: "The main event",
    s7Title: "One battle a day.",
    s7Bullet1: (w: TW) => `Every ${w.team} is entered automatically. Tap Join to fight yourself.`,
    s7Bullet2: (w: TW) => `The winning ${w.team}'s players earn 🔶 ${w.play}.`,
    s7Bullet3: "Trophies go to the day's champion and the final blow.",
    s7Bullet4: (w: TW) => `The battle is for fun and ${w.play}, not cash.`,

    // 08 · Duels and bets
    s8Kicker: "Side action",
    s8Title: "Feeling confident? Stake it.",
    s8Bullet1Pre: (w: TW) => `Duel another ${w.agent} with `,
    s8Bullet1Post: (_w: TW) => ".",
    s8Bullet2Pre: "Back a result with ",
    s8Bullet2Post: ".",
    s8Bullet3: (w: TW) =>
      `Both run in Discord, and the stakes are 🔶 ${w.play} only. Your 💰 ${w.points} is never on the line.`,

    // 09 · Fair play
    s9Kicker: "The house rules",
    s9Title: "Play it straight.",
    s9Bullet1: (w: TW) => `One wallet, one ${w.agent}.`,
    s9Bullet2: "Game scores are server-verified, with anti-cheat on every run.",
    s9Bullet3: "Farming and spam posts get denied, and you are told the reason.",
    s9Bullet4: "The operator is excluded from payouts.",
    s9P: "Play it straight and none of this ever touches you.",

    // 10 · FAQ
    s10Kicker: "Quick answers",
    s10Title: "FAQ.",
    faq1q: (_w: TW) => "Do I need to be good at games?",
    faq1a: (w: TW) =>
      `No. Holding earns most of the ${w.points}, and the arcade is capped at ${w.cap} ${w.points} a day. A player who never touches a game can still lead the season. Games are the fun on top, and they pay the ${w.play} that dresses your ${w.agent}.`,
    faq2q: (w: TW) => `What does closing a ${w.contract} mean?`,
    faq2a: (w: TW) =>
      `A ${w.contract} closes when its domain reaches its launch target and bonds. Closed ${w.contracts} graduate on Doma, and each one unlocks an equal slice of the pool for everyone. Only closed ${w.contracts} pay.`,
    faq3q: (w: TW) => `Can I hold more than one ${w.contract}?`,
    faq3a: (w: TW) =>
      `Yes. Your daily ${w.points} counts your total held across every ${w.contract}. The first $25 earns the full rate, then a reduced rate up to your ceiling. Your ceiling starts at $100 and grows $10 for each ${w.contract} you hold, up to $150, so spreading your holds raises your own ceiling, helps more of the board close, and every close unlocks more of the pool.`,
    faq4q: (_w: TW) => "When do I get paid?",
    faq4aPre: (w: TW) =>
      `At season end. The top three ${w.teams} by ${w.points} split the unlocked pool 50 / 30 / 20, and your cut is your share of your ${w.team}'s ${w.points} among $5+ holders. Run `,
    faq4aPost: " in Discord for your private projection.",
    faq5q: (w: TW) => `What if my ${w.team} loses?`,
    faq5a: (w: TW) =>
      `Second place still takes 30% of the pool and third takes 20%, so a strong season pays even off the top spot. And every ${w.contract} that closes unlocks more of the pool for the whole board, whoever finishes first.`,
    faq6q: (w: TW) => `Do I pick my ${w.team}?`,
    faq6aPre: "No, you are drafted so the sides stay balanced. You can switch once with ",
    faq6aPost: (w: TW) => `, then your ${w.team} locks for the season.`,
    faq7q: (w: TW) => `Is ${w.play} worth real money?`,
    faq7a: (w: TW) =>
      `No. ${w.play} buys gear, skins, stat levels, duel stakes, and bets. It never converts to cash or ${w.points}.`,
    faq8q: (_w: TW) => "Where do I check my numbers?",
    faq8aSeg2: (w: TW) =>
      ` in Discord shows your ${w.points} and your projected cut, privately. The `,
    faq8aSeg3: (w: TW) => ` shows the ${w.team} standings and every ${w.contract}'s progress.`,

    footSeasonHome: "Season home",
    footArcade: "The Arcade",
    footBackToTop: "Back to top",
  },
};

export type S4Dict = typeof en;

// ── KO (한국어) ───────────────────────────────────────────────────────────────

const ko: S4Dict = {
  common: {
    statusBoard: "현황판",
    linkDiscord: "Discord 연동",
    openArcade: "아케이드 열기",
  },

  hero: {
    tagline1a: "teams 셋. contracts 다섯.",
    tagline1b: "성사된 contract마다 보상이 나옵니다.",
    taglineSub: (w) =>
      `$5부터 추천 도메인을 보유하세요. 보유하면 매일 ${w.points}를 획득합니다. contracts를 성사시키고 장부를 올려 시즌 종료 시 보상을 받으세요.`,
    ledgerPoolLabel: "잠금 해제된 상금 풀",
    ledgerOf: "/",
    cdBriefingLabel: "브리핑 시작까지",
    cdEndLabel: "시즌 종료까지",
    cdDoneLabel: "시즌",
    cdDoneValue: "종료",
    ctaJoin: "브리핑 참여하기",
    ctaPlay: "아케이드 플레이",
    ctaView: "THE HIT LIST 보기",
  },

  landing: {
    signUp: "가입하기",
    arcadeBtn: "아케이드",

    howItWorksEyebrow: "플레이 방법",
    howItWorksTitle: "임무까지 세 단계.",
    steps: [
      {
        title: "배정을 받으세요.",
        body: (w) =>
          `참여하면 Agency가 균형 잡힌 team에 배정합니다. ${w.team0}, ${w.team1}, ${w.team2} 중 하나입니다. 다른 시대를 원하시나요? /assassin team으로 한 번 바꿀 수 있고, 그다음엔 고정됩니다.`,
      },
      {
        title: "도메인을 보유하세요.",
        body: (w) =>
          `$5부터 추천 도메인을 사서 그냥 보유하세요. 보유하면 매일, 보유한 contract마다 ${w.points}를 획득합니다. ${w.points}가 곧 당신의 점수입니다.`,
      },
      {
        title: "플레이하고 공유하세요.",
        body: (w) =>
          `아케이드를 플레이하고 ${w.agent}를 꾸미고 시즌 소식을 공유하세요. 성사되는 ${w.contract}마다 모두를 위한 풀이 더 열립니다.`,
      },
    ],

    prizeEyebrow: "상금",
    prizeTitle: "$500이 조각씩 열립니다.",
    prizeWeek1Bold: "1주차 풀: $500.",
    prizeWeek1Rest: " 2주차에 contracts가 더 추가되고, 풀도 함께 커집니다.",
    tiersLabel: "등급:",
    tiersRest: (w) =>
      ` 더 많은 ${w.contracts}에 $5 이상을 보유하면 다섯 등급, Contractor, Operative, Specialist, Cleaner, Kingpin을 거쳐 올라갑니다. 첫 등급 이후 매 등급마다 일일 ${w.points}에 5%가 더해져, Kingpin에서 최대 +20%까지 늘어납니다.`,

    currenciesEyebrow: "두 가지 화폐",
    currenciesTitle: (w) => `${w.points}와 ${w.play}. 그게 전부입니다.`,
    bountyCardSub: "당신의 점수. 보상을 결정합니다.",
    bountyCardBody: (w) =>
      `보유하면 매일 ${w.points}를 벌고, 공유와 플레이로 조금 더 얻습니다. ${w.points}가 많을수록 시즌 종료 시 풀에서 가져가는 몫이 커집니다. 실제로 보상을 주는 건 이쪽입니다.`,
    goldCardSub: "당신의 꾸미기 예산. 오직 재미용.",
    goldCardBody: (w) =>
      `${w.play}는 아케이드에서 벌어 ${w.agent}의 장비와 스타일에 씁니다. ${w.play}는 현금이나 ${w.points}로 바뀌지 않습니다. 그저 멋있어질 뿐입니다.`,

    teamsEyebrow: "team 소개",
    teamsTitle: "세 시대. 당신은 배정됩니다.",
    teamsIntroPre:
      "직접 고르지 않습니다. 참여하면 인원이 필요한 team에 자동 배정되어 진영이 공정하게 유지됩니다. 다른 시대를 원하면 ",
    teamsIntroPost: "으로 한 번 바꿀 수 있고, 그다음엔 team이 시즌 동안 고정됩니다.",
    teamCards: [
      { era: "과거 · EST. 1887", line: "옛 서부의 카우걸들. 가장 먼저 총을 뽑고, 가장 먼저 현상금을 챙깁니다." },
      { era: "미래 · EST. 2087", line: "2087년에서 온 테크 어쌔신. 임무가 시작되기도 전에 전체를 꿰뚫습니다." },
      { era: "현재 · EST. NOW", line: "지금 이 순간 움직이는 정장 차림들. 깔끔한 일 처리, 흔적 하나 남기지 않습니다." },
    ],

    agentEyebrow: (w) => `당신의 ${w.agent}`,
    agentTitle: "조합마다 다른 어쌔신이 됩니다.",
    agentBody: (w) =>
      `플레이하면 ${w.play}를 법니다. ${w.play}로 장비를 삽니다. 🛡️ 방어구, 🏍️ 탈것, 🛠️ 장비. 장비 조합마다 여자와 남자, 서로 다른 어쌔신이 되고, 잠금 해제한 모든 룩은 당신 것이 되어 보드에서 착용할 수 있습니다.`,

    arcadeEyebrow: "아케이드",
    arcadeTitle: "네 가지 임무. 엄지 하나로.",
    gameLines: [
      "말을 타고 메인 스트리트를 달리세요. 술집을 정리하고 마차를 떨어뜨리세요.",
      "무법자 무리가 조여드는 동안 메인 스트리트를 지키세요.",
      "당신은 도주 운전수. 연막을 터뜨리고 추격자를 따돌리세요.",
      "네온 거리를 가르는 야간 바이크로 탈출 지점까지 달리세요.",
    ],
    playNow: "지금 플레이",
    arcadeCaption: (w) =>
      `각 게임은 약 1분, 하루 한 번 점수에 반영되며, 연습은 언제든 가능합니다. 게임은 ${w.play}와 약간의 ${w.points}를 줍니다. 핵심 엔진은 여전히 보유입니다.`,

    faqEyebrow: "FAQ",
    faqTitle: "빠른 답변.",
    fullRules: "전체 규칙",
    faq: [
      {
        q: (_w) => "게임을 잘해야 하나요?",
        a: (w) => `아니요. ${w.points}는 대부분 보유에서 나옵니다. 게임은 그 위에 얹는 재미입니다.`,
      },
      {
        q: (w) => `${w.contract} 성사가 무슨 뜻인가요?`,
        a: (w) =>
          `${w.contract}는 해당 도메인이 런칭 목표에 도달해 본딩되면 성사됩니다. 성사된 ${w.contracts}는 Doma에서 졸업하고, $500 풀의 균등한 몫을 모두에게 열어 줍니다.`,
      },
      {
        q: (_w) => "언제 보상을 받나요?",
        a: (w) =>
          `시즌 종료 시입니다. ${w.points} 상위 teams가 풀을 나누고, 당신의 몫은 team 안에서 당신이 차지하는 비율입니다. 자격을 갖추려면 $5 보유가 필요합니다.`,
      },
      {
        q: (_w) => "우리 team이 지면 어떻게 되나요?",
        a: (w) =>
          `2위와 3위 teams도 더 작은 몫을 가져갑니다. 그리고 성사되는 ${w.contract}마다 보드 전체를 위한 풀이 더 열립니다.`,
      },
    ],

    footerMap: "맵",
    footerAlreadyPlaying: "이미 플레이 중인가요?",
  },

  rules: {
    h1: "규칙",
    headerIntro:
      "시즌에 관한 모든 것을 한 페이지에. 짧고, 쉽고, 빠짐없이. 여기 없는 질문이 있다면 Discord에서 물어보세요, 추가하겠습니다.",

    tocGame: "게임",
    tocPrize: "상금",
    tocEarning: (w) => `${w.points} 벌기`,
    tocAgent: (w) => `당신의 ${w.agent}`,
    tocDaily: "일일 배틀",
    tocDuels: "결투와 베팅",
    tocFair: "공정 플레이",
    tocFaq: "FAQ",

    s1Kicker: "여기서 시작",
    s1Title: "게임 전체를 한 줄로.",
    s1Panel: (w) =>
      `추천 도메인, 곧 ${w.contracts}를 $5부터 사서 보유하세요. 보유하면 매일 💰 ${w.points}를 획득합니다. ${w.contract}는 도메인이 런칭 목표에 도달하면 성사됩니다. 오직 성사된 ${w.contracts}만 보상을 줍니다.`,
    s1P: (w) =>
      `이것이 시즌의 척추입니다. 이 페이지의 나머지는 세부 사항입니다. 풀, ${w.teams}, 아케이드, 배틀. 딱 하나만 한다면, 믿는 것을 보유하고 하루하루가 보상하게 두세요.`,
    s1NewHere: "처음이신가요",
    s1Bullet1Pre: "",
    s1Bullet1Post: (w) => `에 참여하세요. 도착하면 team에 배정됩니다.`,
    s1Bullet2Pre: (w) => `${w.contract} 하나를 `,
    s1Bullet2Post: (_w) => "에서 고르고 $5부터 보유하세요.",
    s1Bullet3Pre: "이미 보유 중인가요? ",
    s1Bullet3Post: ".",

    s2Kicker: "풀",
    s2Title: "풀은 조각씩 열립니다.",
    s2Week1Bold: "1주차 풀: $500.",
    s2Week1Rest: (w) => ` 2주차에 ${w.contracts}가 더 추가되고, 풀도 함께 커집니다.`,
    s2P2: (w) =>
      `풀은 균등한 조각으로 열립니다. 성사되는 ${w.contract}마다 모든 ${w.team}의 모두에게 한 조각이 열립니다. ${w.contracts}의 절반이 성사되면 풀의 절반이 열립니다. 모든 ${w.contract}가 성사되면 풀 전체가 지급됩니다. 오직 성사된 ${w.contracts}만 보상을 줍니다.`,
    s2P3: (w) => `시즌 종료 시, 총 ${w.points} 상위 세 ${w.teams}가 열린 풀을 나눕니다:`,
    s2P4: (w) =>
      `당신 개인의 몫은 $5 이상을 보유한 팀원들 사이에서 당신이 차지하는 ${w.team}의 ${w.points} 비율입니다. ${w.team} 안에서 비율이 클수록 그 상금에서 가져가는 조각도 커집니다.`,
    s2P5Pre: "예상 보상은 비공개입니다. Discord에서 ",
    s2P5Post: "을 실행해 언제든 자신의 위치를 확인하세요.",

    s3Kicker: "진영",
    s3Title: (w) => `세 ${w.teams}. 당신은 배정됩니다.`,
    s3Bullet1: (w) =>
      `참여하면 인원이 필요한 ${w.team}에 자동 배정되어 진영이 균형을 유지합니다.`,
    s3Bullet2Pre: "다른 진영을 원하시나요? ",
    s3Bullet2Post: (w) => `으로 한 번 바꿀 수 있습니다. 그다음엔 ${w.team}이 시즌 동안 고정됩니다.`,
    s3Bullet3: (w) =>
      `당신이 버는 ${w.points} 한 점 한 점이 ${w.team}을 순위 위로 밀어 올립니다. 팀원들은 당신과 운명을 함께합니다.`,

    s4Kicker: "점수",
    s4Title: (w) => `💰 ${w.points}를 버는 세 가지 방법.`,
    s4Intro: (w) =>
      `${w.points}는 당신의 점수이자 풀에 대한 권리입니다. 정확히 세 곳에서만 나옵니다. 다른 무엇도 움직이지 않습니다. 보유가 엔진이고, 나머지 둘은 덤입니다.`,
    s4HoldLabel: "1 · 보유",
    s4HoldTitle: "엔진. 자동으로, 매일.",
    s4HoldBody: (w) =>
      `처음 $25까지는 $5마다 50 ${w.points}를 온전히 벌어, $25 보유 시 티어와 신선도 적용 전 하루 250을 법니다. $25를 넘으면 그 4분의 1 비율로 상한까지 계속 법니다. 상한은 $100에서 시작해, $5 이상 보유한 ${w.contract}마다 $10씩 올라 최대 $150까지 늘어나므로, 5개에 모두 분산하면 상한이 $150이 되어 하루 약 562입니다. 상한을 넘겨 보유하면 ${w.contract} 본딩에는 도움이 되지만 일일 ${w.points}는 더 늘지 않습니다. 큰 보유자는 더 벌어 비싼 ${w.contracts}로 유인되지만, 수익이 점점 줄어들어 아무도 독주하지 못합니다. 보유란 모든 ${w.contract}에 걸친 총액을 뜻합니다. 청구도, 출석 체크도 없습니다.`,
    s4HoldFresh: (w) =>
      `새로 등록된 ${w.contracts}일수록 $5당 더 많이 지급합니다. 막 등록된 ${w.contract}는 첫날 $5당 100까지 최대 두 배를 주고, 약 10일에 걸쳐 50으로 낮아집니다. 가장 오래된 것 하나만 붙잡기보다 새 ${w.contracts}로 분산하는 편이 더 많이 법니다.`,
    s4HoldTableHeld: "보유액",
    s4HoldTableDaily: "일일 기본",
    s4HoldTableCaption: "티어와 신선도 배수 적용 전 기준입니다.",
    s4HoldTableCapped: "상한 적용",
    s4TiersLabel: (w) => `등급: ${w.contracts.toUpperCase()}를 더 보유하고, 배수를 키우세요`,
    s4TiersBody: (w) =>
      `등급은 $5 이상 보유한 서로 다른 ${w.contracts}의 개수입니다. 첫 등급 이후 등급마다 일일 보유 ${w.points}에 5%가 더해집니다. 1등급 Contractor x1.00, 2등급 Operative x1.05, 3등급 Specialist x1.10, 4등급 Cleaner x1.15, 5등급 Kingpin은 다섯 개 이상에서 x1.20. 보드를 넓게 잡으면 등급이 오르고 매일 보상받습니다.`,
    s4PostLabel: "2 · 공유",
    s4PostTitle: "확성기. 하루 한 번 반영.",
    s4PostBullet1Pre: "X 게시물 링크를 ",
    s4PostBullet1Post: "에 올리세요.",
    s4PostBullet2: (w) =>
      `하루에 한 게시물이 반영됩니다. 30 ${w.points}에서 시작해 도달 범위가 커지면 170까지 오릅니다.`,
    s4PostBullet3: (w) => `시즌이나 ${w.contract}를 언급해야 하고, $5 이상 보유가 필요합니다.`,
    s4PlayLabel: "3 · 플레이",
    s4PlayTitle: "위에 얹는 재미.",
    s4PlayBody: (w) =>
      `매 판마다 🔶 ${w.play}와 약간의 ${w.points}를 줍니다. 네 게임을 모두 플레이하면 하루 최대 ${w.cap} ${w.points}까지 얻습니다. 아케이드의 진짜 보상은 ${w.play}이고, 게임에서 나오는 ${w.points}는 가장 적은 원천입니다. 엔진은 보유입니다.`,

    s5Kicker: "재미용 화폐",
    s5Title: (w) => `🔶 ${w.play}는 겉모습을 사지, 보상을 사지 않습니다.`,
    s5P1: (w) =>
      `${w.play}는 재미용 화폐입니다. 아케이드를 플레이하고 퀘스트를 클리어해 법니다. ${w.agent}에게 씁니다. 장비, 스킨, 스탯 레벨, 결투 판돈, 베팅.`,
    s5Panel: (w) =>
      `${w.play}는 현금이나 ${w.points}로 바뀌지 않습니다. 풀에 손댈 수 없습니다. 빛나면 ${w.play}, 보상하면 ${w.points}입니다.`,

    s6Kicker: "옷장",
    s6Title: "조합마다 다른 어쌔신이 됩니다.",
    s6P: (w) =>
      `${w.play}로 세 슬롯의 장비를 삽니다. 🛡️ 방어구, 🏍️ 탈것, 🛠️ 장비. 장비 조합마다 여자와 남자 버전의 서로 다른 어쌔신이 열립니다. 어느 쪽이든 착용하세요. 잠금 해제한 모든 룩은 당신 것입니다.`,

    s7Kicker: "메인 이벤트",
    s7Title: "하루 한 번의 배틀.",
    s7Bullet1: (w) => `모든 ${w.team}은 자동으로 참가합니다. 직접 싸우려면 Join을 누르세요.`,
    s7Bullet2: (w) => `승리한 ${w.team}의 플레이어들은 🔶 ${w.play}를 법니다.`,
    s7Bullet3: "트로피는 그날의 챔피언과 마지막 일격에게 돌아갑니다.",
    s7Bullet4: (w) => `배틀은 재미와 ${w.play}를 위한 것이지, 현금이 아닙니다.`,

    s8Kicker: "부가 액션",
    s8Title: "자신 있나요? 걸어 보세요.",
    s8Bullet1Pre: (w) => `다른 ${w.agent}에게 `,
    s8Bullet1Post: (_w) => "로 결투를 신청하세요.",
    s8Bullet2Pre: "결과에 ",
    s8Bullet2Post: "로 베팅하세요.",
    s8Bullet3: (w) =>
      `둘 다 Discord에서 진행되며, 판돈은 오직 🔶 ${w.play}입니다. 당신의 💰 ${w.points}는 결코 걸리지 않습니다.`,

    s9Kicker: "하우스 룰",
    s9Title: "정정당당하게.",
    s9Bullet1: (w) => `지갑 하나, ${w.agent} 하나.`,
    s9Bullet2: "게임 점수는 서버에서 검증되며, 모든 판에 안티치트가 적용됩니다.",
    s9Bullet3: "파밍과 스팸 게시물은 거부되며, 그 이유를 알려 드립니다.",
    s9Bullet4: "운영자는 보상에서 제외됩니다.",
    s9P: "정정당당하게 플레이하면 이 중 어느 것도 당신을 건드리지 않습니다.",

    s10Kicker: "빠른 답변",
    s10Title: "FAQ.",
    faq1q: (_w) => "게임을 잘해야 하나요?",
    faq1a: (w) =>
      `아니요. ${w.points}는 대부분 보유에서 나오고, 아케이드는 하루 ${w.cap} ${w.points}로 제한됩니다. 게임을 한 번도 안 하는 플레이어도 시즌을 이끌 수 있습니다. 게임은 위에 얹는 재미이고, ${w.agent}를 꾸미는 ${w.play}를 줍니다.`,
    faq2q: (w) => `${w.contract} 성사가 무슨 뜻인가요?`,
    faq2a: (w) =>
      `${w.contract}는 도메인이 런칭 목표에 도달해 본딩되면 성사됩니다. 성사된 ${w.contracts}는 Doma에서 졸업하고, 각각 풀의 균등한 조각을 모두에게 열어 줍니다. 오직 성사된 ${w.contracts}만 보상을 줍니다.`,
    faq3q: (w) => `${w.contract}를 여러 개 보유할 수 있나요?`,
    faq3a: (w) =>
      `네. 일일 ${w.points}는 모든 ${w.contract}에 걸친 총 보유액으로 계산됩니다. 처음 $25는 전액 비율로, 그 위로는 낮은 비율로 상한까지 계산됩니다. 상한은 $100에서 시작해 보유한 ${w.contract}마다 $10씩 올라 최대 $150까지 늘어나므로, 분산 보유는 자신의 상한을 높이고 보드가 더 많이 성사되도록 도우며, 성사될 때마다 풀이 더 열립니다.`,
    faq4q: (_w) => "언제 보상을 받나요?",
    faq4aPre: (w) =>
      `시즌 종료 시입니다. ${w.points} 상위 세 ${w.teams}가 열린 풀을 50 / 30 / 20으로 나누고, 당신의 몫은 $5 이상 보유자들 사이에서 당신이 차지하는 ${w.team}의 ${w.points} 비율입니다. Discord에서 `,
    faq4aPost: "을 실행하면 개인 예상치를 볼 수 있습니다.",
    faq5q: (w) => `우리 ${w.team}이 지면 어떻게 되나요?`,
    faq5a: (w) =>
      `2위도 풀의 30%, 3위도 20%를 가져가므로, 1위가 아니어도 좋은 시즌은 보상합니다. 그리고 성사되는 ${w.contract}마다 누가 1위를 하든 보드 전체를 위한 풀이 더 열립니다.`,
    faq6q: (w) => `${w.team}을 직접 고르나요?`,
    faq6aPre: "아니요, 진영 균형을 위해 배정됩니다. ",
    faq6aPost: (w) => `으로 한 번 바꿀 수 있고, 그다음엔 ${w.team}이 시즌 동안 고정됩니다.`,
    faq7q: (w) => `${w.play}는 실제 돈의 가치가 있나요?`,
    faq7a: (w) =>
      `아니요. ${w.play}는 장비, 스킨, 스탯 레벨, 결투 판돈, 베팅을 삽니다. 현금이나 ${w.points}로는 결코 바뀌지 않습니다.`,
    faq8q: (_w) => "내 수치는 어디서 확인하나요?",
    faq8aSeg2: (w) =>
      `를 Discord에서 실행하면 당신의 ${w.points}와 예상 몫을 비공개로 보여 줍니다. `,
    faq8aSeg3: (w) => `은 ${w.team} 순위와 모든 ${w.contract}의 진행 상황을 보여 줍니다.`,

    footSeasonHome: "시즌 홈",
    footArcade: "아케이드",
    footBackToTop: "맨 위로",
  },
};

// ── ZH (中文) ─────────────────────────────────────────────────────────────────

const zh: S4Dict = {
  common: {
    statusBoard: "状态板",
    linkDiscord: "关联 Discord",
    openArcade: "打开街机厅",
  },

  hero: {
    tagline1a: "三支 teams。五个 contracts。",
    tagline1b: "每一个达成的 contract 都有回报。",
    taglineSub: (w) =>
      `以 $5 起持有任一精选域名。持有即可每日赚取 ${w.points}。达成 contracts，登上榜单，赛季结束时领取回报。`,
    ledgerPoolLabel: "已解锁奖池",
    ledgerOf: "/",
    cdBriefingLabel: "简报开启倒计时",
    cdEndLabel: "赛季结束倒计时",
    cdDoneLabel: "赛季",
    cdDoneValue: "已结束",
    ctaJoin: "加入简报",
    ctaPlay: "进入街机厅",
    ctaView: "查看 THE HIT LIST",
  },

  landing: {
    signUp: "注册",
    arcadeBtn: "街机厅",

    howItWorksEyebrow: "玩法",
    howItWorksTitle: "三步接下任务。",
    steps: [
      {
        title: "接受编入。",
        body: (w) =>
          `加入后，Agency 会把你编入一支实力均衡的 team，${w.team0}、${w.team1} 或 ${w.team2} 之一。想换个时代？用 /assassin team 切换一次，之后即锁定。`,
      },
      {
        title: "持有域名。",
        body: (w) =>
          `以 $5 起买入任一精选域名，然后只管持有。持有即可每日按你持有的每个 contract 赚取 ${w.points}。${w.points} 就是你的分数。`,
      },
      {
        title: "游玩并分享。",
        body: (w) =>
          `玩街机、为你的 ${w.agent} 添置装备、分享赛季动态。每达成一个 ${w.contract}，就为所有人解锁更多奖池。`,
      },
    ],

    prizeEyebrow: "奖金",
    prizeTitle: "$500 逐块解锁。",
    prizeWeek1Bold: "第 1 周奖池：$500。",
    prizeWeek1Rest: " 第 2 周会有更多 contracts 上线，奖池也随之增长。",
    tiersLabel: "阶级：",
    tiersRest: (w) =>
      ` 在更多 ${w.contracts} 中各持有 $5 以上，即可逐级晋升五个阶级：Contractor、Operative、Specialist、Cleaner、Kingpin。第一阶之后每升一阶，为你的每日 ${w.points} 加 5%，到 Kingpin 最高 +20%。`,

    currenciesEyebrow: "两种货币",
    currenciesTitle: (w) => `${w.points} 和 ${w.play}。仅此而已。`,
    bountyCardSub: "你的分数。它决定你的回报。",
    bountyCardBody: (w) =>
      `持有让你每日赚取 ${w.points}，分享和游玩再添一点。${w.points} 越多，赛季结束时从奖池分到的份额就越大。真正带来回报的就是它。`,
    goldCardSub: "你的装扮预算。纯为好玩。",
    goldCardBody: (w) =>
      `${w.play} 从街机厅赚取，用于你的 ${w.agent} 的装备与造型。${w.play} 永远不会变成现金或 ${w.points}。它只让你更帅气。`,

    teamsEyebrow: "team 介绍",
    teamsTitle: "三个时代。你会被编入。",
    teamsIntroPre:
      "你无法自选。加入时会自动编入需要人手的 team，让各方保持公平。若想换个时代，用 ",
    teamsIntroPost: " 切换一次，之后你的 team 就会锁定整个赛季。",
    teamCards: [
      { era: "过去 · EST. 1887", line: "旧西部的女枪手。最先拔枪，最先拿下赏金。" },
      { era: "未来 · EST. 2087", line: "来自 2087 年的科技刺客。任务还没开始，她们已看清全局。" },
      { era: "现在 · EST. NOW", line: "此刻行动的西装身影。干净利落，不留一丝首尾。" },
    ],

    agentEyebrow: (w) => `你的 ${w.agent}`,
    agentTitle: "每种搭配都是不同的刺客。",
    agentBody: (w) =>
      `游玩赚取 ${w.play}。${w.play} 用来买装备：🛡️ 护甲、🏍️ 座驾、🛠️ 装备。每种装备搭配都是一位不同的刺客，有女款和男款，你解锁的每种造型都归你所有，可在面板上穿戴。`,

    arcadeEyebrow: "街机厅",
    arcadeTitle: "四项任务。一根拇指。",
    gameLines: [
      "骑马冲过主街。扫清酒馆，掀翻马车。",
      "在不法帮派层层围拢时，守住主街。",
      "你是逃车手。放出烟幕，甩开追兵。",
      "骑上夜行摩托，穿过霓虹街巷抵达接应点。",
    ],
    playNow: "立即游玩",
    arcadeCaption: (w) =>
      `每局约一分钟，每日计分一次，随时可练习。游戏给出 ${w.play} 和少量 ${w.points}。持有仍是主引擎。`,

    faqEyebrow: "FAQ",
    faqTitle: "快速解答。",
    fullRules: "完整规则",
    faq: [
      {
        q: (_w) => "我需要很会玩游戏吗？",
        a: (w) => `不需要。${w.points} 大多来自持有。游戏是锦上添花。`,
      },
      {
        q: (w) => `达成一个 ${w.contract} 是什么意思？`,
        a: (w) =>
          `当某个 ${w.contract} 的域名达到发行目标并完成 bonding，它便达成。达成的 ${w.contracts} 在 Doma 上毕业，并为所有人解锁 $500 奖池中均等的一份。`,
      },
      {
        q: (_w) => "我什么时候拿到回报？",
        a: (w) =>
          `赛季结束时。${w.points} 最高的几支 teams 瓜分奖池，你的份额取决于你在自己 team 中的占比。需持有 $5 才有资格。`,
      },
      {
        q: (_w) => "如果我的 team 输了怎么办？",
        a: (w) =>
          `第二、第三名的 teams 仍能分到较小的份额。而且每达成一个 ${w.contract}，都会为整个面板解锁更多奖池。`,
      },
    ],

    footerMap: "地图",
    footerAlreadyPlaying: "已经在玩了？",
  },

  rules: {
    h1: "规则",
    headerIntro:
      "赛季的一切，尽在一页。简短、直白、完整。若这里没有答到的问题，就在 Discord 里提问，我们会补上。",

    tocGame: "游戏",
    tocPrize: "奖金",
    tocEarning: (w) => `赚取 ${w.points}`,
    tocAgent: (w) => `你的 ${w.agent}`,
    tocDaily: "每日battle",
    tocDuels: "决斗与下注",
    tocFair: "公平竞技",
    tocFaq: "FAQ",

    s1Kicker: "从这里开始",
    s1Title: "一句话讲完整个游戏。",
    s1Panel: (w) =>
      `以 $5 起买入并持有精选域名，也就是 ${w.contracts}。持有即可每日赚取 💰 ${w.points}。当某个 ${w.contract} 的域名达到发行目标时便达成。只有达成的 ${w.contracts} 才有回报。`,
    s1P: (w) =>
      `这就是赛季的主干。本页其余都是细节：奖池、${w.teams}、街机厅、battle。若只做一件事，就持有你所相信的，让日子替你带来回报。`,
    s1NewHere: "新手上路",
    s1Bullet1Pre: "加入 ",
    s1Bullet1Post: (w) => `。到达后你会被编入一支 ${w.team}。`,
    s1Bullet2Pre: (_w) => `在 `,
    s1Bullet2Post: (w) => ` 上挑一个 ${w.contract}，以 $5 起持有。`,
    s1Bullet3Pre: "已经在持有了？ ",
    s1Bullet3Post: "。",

    s2Kicker: "奖池",
    s2Title: "奖池逐块解锁。",
    s2Week1Bold: "第 1 周奖池：$500。",
    s2Week1Rest: (w) => ` 第 2 周会有更多 ${w.contracts} 上线，奖池也随之增长。`,
    s2P2: (w) =>
      `奖池以均等的份额解锁。每达成一个 ${w.contract}，就为每一支 ${w.team} 的所有人解锁一份。若 ${w.contracts} 有一半达成，奖池便解锁一半。若每个 ${w.contract} 都达成，整个奖池悉数发放。只有达成的 ${w.contracts} 才有回报。`,
    s2P3: (w) => `赛季结束时，总 ${w.points} 最高的三支 ${w.teams} 瓜分已解锁的奖池：`,
    s2P4: (w) =>
      `你个人的份额，取决于在持有 $5 以上的队友中，你占自己 ${w.team} 的 ${w.points} 的比例。在 ${w.team} 中占比越大，从奖金里分到的一块就越大。`,
    s2P5Pre: "你的预计回报是私密的。在 Discord 里运行 ",
    s2P5Post: "，随时查看自己的位置。",

    s3Kicker: "阵营",
    s3Title: (w) => `三支 ${w.teams}。你会被编入。`,
    s3Bullet1: (w) =>
      `加入时会自动编入需要人手的 ${w.team}，让各方保持均衡。`,
    s3Bullet2Pre: "想换一边？用 ",
    s3Bullet2Post: (w) => ` 切换一次。之后你的 ${w.team} 就锁定整个赛季。`,
    s3Bullet3: (w) =>
      `你赚取的每一点 ${w.points} 都会把你的 ${w.team} 往榜单上推。队友与你同命运。`,

    s4Kicker: "分数",
    s4Title: (w) => `赚取 💰 ${w.points} 的三种方式。`,
    s4Intro: (w) =>
      `${w.points} 是你的分数，也是你对奖池的主张。它恰好只来自三个地方，别无他途。持有是引擎，另外两项是外快。`,
    s4HoldLabel: "1 · 持有",
    s4HoldTitle: "引擎。自动，每天。",
    s4HoldBody: (w) =>
      `每天你持有的前 $25，每 $5 都按全额赚取 50 ${w.points}，因此持有 $25 每天得 250（未计阶级与新鲜度加成）。超过 $25 后仍按四分之一的费率继续赚取，直到你的上限。上限从 $100 起，每持有一个 $5 以上的 ${w.contract} 就上调 $10，最高 $150，因此分散持有全部五个可将上限提升到 $150，每天约 562。持有超过上限有助于 ${w.contract} 完成 bonding，但不再增加每日 ${w.points}。大户赚得更多，会被吸引去持有较贵的 ${w.contracts}，但收益递减，所以没人能一骑绝尘。持有指你在所有 ${w.contract} 上的总额。无需领取，无需签到。`,
    s4HoldFresh: (w) =>
      `越新的 ${w.contracts} 每 $5 给得越多。刚上线的 ${w.contract} 第一天每 $5 最高给到 100，可达双倍，之后约 10 天内回落到 50。与其死守最老的一个，不如把持有分散到新的 ${w.contracts} 上，赚得更多。`,
    s4HoldTableHeld: "持有",
    s4HoldTableDaily: "每日基础",
    s4HoldTableCaption: "未计入你的阶级与新鲜度倍数。",
    s4HoldTableCapped: "已封顶",
    s4TiersLabel: (w) => `阶级：持有更多 ${w.contracts.toUpperCase()}，放大倍数`,
    s4TiersBody: (w) =>
      `你的阶级，就是你持有 $5 以上的不同 ${w.contracts} 的数量。第一阶之后每升一阶，为你的每日持有 ${w.points} 加 5%：第 1 阶 Contractor x1.00，第 2 阶 Operative x1.05，第 3 阶 Specialist x1.10，第 4 阶 Cleaner x1.15，第 5 阶 Kingpin 在五个及以上时 x1.20。把面板铺得越广，阶级越高，每天都有回报。`,
    s4PostLabel: "2 · 分享",
    s4PostTitle: "扩音器。每日一次计入。",
    s4PostBullet1Pre: "把你的 X 帖子链接发到 ",
    s4PostBullet1Post: "。",
    s4PostBullet2: (w) =>
      `每日计入一帖。起步 30 ${w.points}，随着触达增长最高可达 170。`,
    s4PostBullet3: (w) => `帖子须提及赛季或某个 ${w.contract}，且你需持有 $5 以上。`,
    s4PlayLabel: "3 · 游玩",
    s4PlayTitle: "锦上添花。",
    s4PlayBody: (w) =>
      `每一局都给出 🔶 ${w.play} 和少量 ${w.points}。四款游戏全部玩过，每天最多可得 ${w.cap} ${w.points}。街机厅真正的奖励是 ${w.play}，游戏带来的 ${w.points} 是最小的一份。引擎始终是持有。`,

    s5Kicker: "好玩的钱",
    s5Title: (w) => `🔶 ${w.play} 买的是造型，绝不是回报。`,
    s5P1: (w) =>
      `${w.play} 是好玩的货币。玩街机、完成任务即可赚取。你把它花在 ${w.agent} 身上：装备、皮肤、属性等级、决斗赌注和下注。`,
    s5Panel: (w) =>
      `${w.play} 永远不会兑成现金或 ${w.points}，也碰不到奖池。发光的是 ${w.play}，能带来回报的是 ${w.points}。`,

    s6Kicker: "衣橱",
    s6Title: "每种搭配都是不同的刺客。",
    s6P: (w) =>
      `${w.play} 可购买三个槽位的装备：🛡️ 护甲、🏍️ 座驾、🛠️ 装备。每种装备搭配都会解锁一位不同的刺客，有女款和男款。任选穿戴。你解锁的每种造型都归你所有。`,

    s7Kicker: "重头戏",
    s7Title: "每天一场battle。",
    s7Bullet1: (w) => `每一支 ${w.team} 都会自动参战。想亲自上阵就点 Join。`,
    s7Bullet2: (w) => `获胜 ${w.team} 的玩家赚取 🔶 ${w.play}。`,
    s7Bullet3: "奖杯归当日冠军与致命一击者。",
    s7Bullet4: (w) => `battle 是为了乐趣与 ${w.play}，不涉及现金。`,

    s8Kicker: "额外玩法",
    s8Title: "有信心？押上它。",
    s8Bullet1Pre: (_w) => `用 `,
    s8Bullet1Post: (w) => ` 向另一位 ${w.agent} 发起决斗。`,
    s8Bullet2Pre: "用 ",
    s8Bullet2Post: "为某个结果下注。",
    s8Bullet3: (w) =>
      `两者都在 Discord 里进行，赌注只有 🔶 ${w.play}。你的 💰 ${w.points} 绝不会被押上。`,

    s9Kicker: "场内规矩",
    s9Title: "光明正大地玩。",
    s9Bullet1: (w) => `一个钱包，一位 ${w.agent}。`,
    s9Bullet2: "游戏分数由服务器核验，每一局都有反作弊。",
    s9Bullet3: "刷分和垃圾帖会被驳回，并告知你原因。",
    s9Bullet4: "运营者不参与分奖。",
    s9P: "光明正大地玩，这些就都与你无关。",

    s10Kicker: "快速解答",
    s10Title: "FAQ。",
    faq1q: (_w) => "我需要很会玩游戏吗？",
    faq1a: (w) =>
      `不需要。${w.points} 大多来自持有，而街机厅每天上限为 ${w.cap} ${w.points}。一个从不碰游戏的玩家，照样能领跑整个赛季。游戏是锦上添花，它给出用来装扮 ${w.agent} 的 ${w.play}。`,
    faq2q: (w) => `达成一个 ${w.contract} 是什么意思？`,
    faq2a: (w) =>
      `当某个 ${w.contract} 的域名达到发行目标并完成 bonding，它便达成。达成的 ${w.contracts} 在 Doma 上毕业，每一个都为所有人解锁奖池中均等的一份。只有达成的 ${w.contracts} 才有回报。`,
    faq3q: (w) => `我可以持有多个 ${w.contract} 吗？`,
    faq3a: (w) =>
      `可以。你的每日 ${w.points} 会把你在所有 ${w.contract} 上的持有总额一并计入。前 $25 按全额费率，之后按较低费率计入，直到你的上限。上限从 $100 起，每持有一个 ${w.contract} 就上调 $10，最高 $150，因此分散持有会抬高你自己的上限，帮助更多面板达成，而每一次达成都解锁更多奖池。`,
    faq4q: (_w) => "我什么时候拿到回报？",
    faq4aPre: (w) =>
      `赛季结束时。${w.points} 最高的三支 ${w.teams} 按 50 / 30 / 20 瓜分已解锁的奖池，你的份额取决于在持有 $5 以上者中，你占自己 ${w.team} 的 ${w.points} 的比例。在 Discord 里运行 `,
    faq4aPost: " 即可查看你的私密预估。",
    faq5q: (w) => `如果我的 ${w.team} 输了怎么办？`,
    faq5a: (w) =>
      `第二名仍拿奖池的 30%，第三名拿 20%，所以即便不是榜首，好的赛季照样有回报。而且每达成一个 ${w.contract}，无论谁最终第一，都会为整个面板解锁更多奖池。`,
    faq6q: (w) => `${w.team} 是我自己选的吗？`,
    faq6aPre: "不是，为保持各方均衡，你会被编入。你可以用 ",
    faq6aPost: (w) => ` 切换一次，之后你的 ${w.team} 就锁定整个赛季。`,
    faq7q: (w) => `${w.play} 值真钱吗？`,
    faq7a: (w) =>
      `不值。${w.play} 用来买装备、皮肤、属性等级、决斗赌注和下注。它永远不会兑成现金或 ${w.points}。`,
    faq8q: (_w) => "我在哪里查看自己的数据？",
    faq8aSeg2: (w) =>
      `，在 Discord 里运行它会私密地显示你的 ${w.points} 和预计份额。`,
    faq8aSeg3: (w) => ` 则显示 ${w.team} 排名和每个 ${w.contract} 的进度。`,

    footSeasonHome: "赛季主页",
    footArcade: "街机厅",
    footBackToTop: "回到顶部",
  },
};

export const STRINGS = { en, ko, zh } as const;

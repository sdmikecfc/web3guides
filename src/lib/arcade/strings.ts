/**
 * LAUNCH WARS ARCADE - landing page copy, en / ko / zh.
 *
 * COPY LAW (the cross-season player contract): plain words a global, mixed
 * education audience can read; no idioms, no finance words, no em-dashes;
 * never a money figure and never "win". The arcade pays nothing and says so.
 *
 * `ArcadeDict = typeof en` forces ko and zh to carry every key (the S7 dict
 * uses the same trick), so a missing translation is a type error, not a blank.
 * Game blurbs for S5/S6/S7 come from those seasons' own dicts (already in all
 * three languages and free of points words); S4 never had localized blurbs,
 * so its four live here.
 */
import type { Locale } from "@/lib/s7/locale";

const en = {
  metaTitle: "Launch Wars Arcade",
  metaDescription:
    "No season is live right now, so the arcade is open. Play the games from every Launch Wars season. Every board is new and everyone starts at 0.",
  navHome: "Arcade",
  navAria: "Arcade navigation",
  langAria: "Language",
  connect: "Connect wallet",
  /** The top bar's short label: the bar has 375px to share with a wordmark and three language chips. */
  navConnect: "Connect",
  eyebrow: "Launch Wars",
  h1: "No season is live right now.",
  sub: "The next season is being built. Until then, the arcade is open. Play the games from every season, and four new games from Season 7 that nobody has played yet. Every board is new. Everyone starts at 0.",
  stepsTitle: "How it works",
  step1: "Connect a wallet.",
  step2: "Sign once. No gas, no transaction.",
  step3: "Play. Your best score in each game goes on the board.",
  signTitle: "Save your scores",
  signBody: "Sign once and you stay signed in for 12 hours, in all sixteen games.",
  signGuest: "You can play without a wallet. Guest scores are not saved.",
  signButton: "Sign in",
  signBusy: "Waiting for your signature",
  signDone: "Signed in. Your best score in each game goes on the board.",
  signCancelled: "Signature cancelled.",
  signFailed: "Could not sign in. Try again.",
  newTag: "New",
  newShelfNote: "Four new games. Nobody has played these yet.",
  play: "Play",
  boardTitle: "Top scores",
  boardEmpty: "No scores yet. Be the first.",
  boardMore: "Show the top 10",
  forFun: "The arcade is for fun. Scores here pay nothing and do not carry into a season.",
  lastSeason: "Season 6 final board",
  studio: "More games at Doma Gaming",
  s4Blurbs: {
    riviera: "Ride hard across the frontier and shoot what chases you",
    highnoon: "Hold the street at noon while the whole town comes for you",
    getaway: "Drive out of the city before the clock runs out",
    extraction: "Race a neon night bike and keep the chain alive",
  },
};

export type ArcadeDict = typeof en;

const ko: ArcadeDict = {
  metaTitle: "Launch Wars 아케이드",
  metaDescription:
    "지금은 진행 중인 시즌이 없어서 아케이드가 열려 있습니다. Launch Wars 모든 시즌의 게임을 플레이하세요. 모든 순위표는 새로 시작하고 모두 0점에서 출발합니다.",
  navHome: "아케이드",
  navAria: "아케이드 내비게이션",
  langAria: "언어",
  connect: "지갑 연결",
  navConnect: "연결",
  eyebrow: "Launch Wars",
  h1: "지금은 진행 중인 시즌이 없습니다.",
  sub: "다음 시즌을 만들고 있습니다. 그동안 아케이드가 열려 있습니다. 모든 시즌의 게임을 플레이할 수 있고, 아직 아무도 해 보지 않은 시즌 7의 새 게임 4개도 있습니다. 모든 순위표는 새로 시작합니다. 모두 0점에서 출발합니다.",
  stepsTitle: "이용 방법",
  step1: "지갑을 연결하세요.",
  step2: "한 번만 서명하세요. 가스비도 거래도 없습니다.",
  step3: "플레이하세요. 게임마다 최고 점수가 순위표에 올라갑니다.",
  signTitle: "점수 저장하기",
  signBody: "한 번 서명하면 12시간 동안 16개 게임 모두에서 로그인 상태가 유지됩니다.",
  signGuest: "지갑 없이도 플레이할 수 있습니다. 게스트 점수는 저장되지 않습니다.",
  signButton: "로그인",
  signBusy: "서명을 기다리는 중",
  signDone: "로그인되었습니다. 게임마다 최고 점수가 순위표에 올라갑니다.",
  signCancelled: "서명이 취소되었습니다.",
  signFailed: "로그인하지 못했습니다. 다시 시도하세요.",
  newTag: "신규",
  newShelfNote: "새 게임 4개. 아직 아무도 플레이하지 않았습니다.",
  play: "플레이",
  boardTitle: "최고 점수",
  boardEmpty: "아직 점수가 없습니다. 첫 번째가 되어 보세요.",
  boardMore: "상위 10명 보기",
  forFun: "아케이드는 재미로 하는 곳입니다. 여기 점수는 보상이 없고 시즌으로 이어지지 않습니다.",
  lastSeason: "시즌 6 최종 순위표",
  studio: "Doma Gaming에서 더 많은 게임 보기",
  s4Blurbs: {
    riviera: "말을 타고 황야를 달리며 쫓아오는 적을 쏘세요",
    highnoon: "정오의 거리에서 몰려오는 적을 모두 막아 내세요",
    getaway: "시간이 끝나기 전에 도시를 빠져나가세요",
    extraction: "네온 야간 바이크를 몰고 연속 콤보를 이어 가세요",
  },
};

const zh: ArcadeDict = {
  metaTitle: "Launch Wars 街机厅",
  metaDescription:
    "目前没有进行中的赛季，所以街机厅已开放。来玩 Launch Wars 每个赛季的游戏。所有排行榜都是全新的，每个人都从 0 开始。",
  navHome: "街机厅",
  navAria: "街机厅导航",
  langAria: "语言",
  connect: "连接钱包",
  navConnect: "连接",
  eyebrow: "Launch Wars",
  h1: "目前没有进行中的赛季。",
  sub: "下一个赛季正在制作中。在此期间，街机厅已开放。你可以玩每个赛季的游戏，还有第 7 赛季的 4 款新游戏，还没有人玩过。所有排行榜都是全新的。每个人都从 0 开始。",
  stepsTitle: "怎么玩",
  step1: "连接钱包。",
  step2: "签名一次。没有 Gas 费，没有交易。",
  step3: "开始玩。你在每款游戏的最高分会登上排行榜。",
  signTitle: "保存你的分数",
  signBody: "签名一次后，12 小时内在全部 16 款游戏中保持登录。",
  signGuest: "没有钱包也可以玩。游客分数不会保存。",
  signButton: "登录",
  signBusy: "正在等待你的签名",
  signDone: "已登录。你在每款游戏的最高分会登上排行榜。",
  signCancelled: "签名已取消。",
  signFailed: "登录失败，请重试。",
  newTag: "全新",
  newShelfNote: "4 款新游戏。还没有人玩过。",
  play: "开始",
  boardTitle: "最高分",
  boardEmpty: "还没有分数。来当第一个。",
  boardMore: "查看前 10 名",
  forFun: "街机厅只为娱乐。这里的分数没有任何奖励，也不会带入赛季。",
  lastSeason: "第 6 赛季最终排行榜",
  studio: "在 Doma Gaming 查看更多游戏",
  s4Blurbs: {
    riviera: "骑马穿越荒野，射击追来的敌人",
    highnoon: "正午时分守住街道，挡住整个小镇的围攻",
    getaway: "在时间用完之前开车逃出城市",
    extraction: "驾驶霓虹夜行摩托，保持连击不断",
  },
};

export const ARCADE_STRINGS: Record<Locale, ArcadeDict> = { en, ko, zh };

export function arcadeDict(locale: Locale): ArcadeDict {
  return ARCADE_STRINGS[locale] ?? en;
}

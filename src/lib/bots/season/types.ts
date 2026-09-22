import type { BuildV6, StateV6 } from "@/lib/bots/v6";
import type { CombatSocket } from "@/lib/bots/combat-model";

export type DefensePlan = "early" | "balanced" | "last-stand";
export type SeasonMode = "ranked" | "direct" | "house" | "loaner" | "exhibition";
export type SeasonPhase = "upcoming" | "current" | "ended";
export interface SeasonInfo { id: string; name: string; startsAt: string; endsAt: string; phase: SeasonPhase; rulesVersion: string }
export interface SeasonDraft { revision: number; name: string; parts: Partial<Record<CombatSocket, string>>; defensePlan: DefensePlan }
export interface RepairQuote { quoteId: string; botId: string; coins: number; readyAt: string; quotedAt: string; expiresAt: string }
export interface SeasonBot {
  id: string; seasonId: string; name: string; build: BuildV6; gp: number; defensePlan: DefensePlan;
  archived: boolean; wins: number; losses: number; rating: number; defenseWins: number; defenseLosses: number;
  repairUntil: string | null; ready: boolean; protectedUntil: string | null; repairQuote: RepairQuote | null;
}
export interface SeasonShopItem { id: string; name: string; slot: string; tier: number; gp: number; coins: number; available: boolean }
export interface SeasonDaily {
  day: string; completions: number; rewardedCompletions: number; remainingRewards: number; playCoins: number;
  goalAt: 6; goalCoins: 100; goalClaimed: boolean; tradeBonus: number; directRated: number; defensiveRankLoss: number;
}
export interface SeasonTradeBonus {
  requiredUsd: 10; percent: 50; dailyCap: 500; unlocked: boolean; earned: number;
  sources: { mcp: "ready" | "unavailable"; strategies: "ready" | "unavailable" };
  message: string;
}
export interface SeasonStateResponse {
  ok: true; readiness: "ready" | "unavailable"; enrollment: "not-enrolled" | "enrolled";
  season: SeasonInfo | null; starterCoins: 250; player: null | { wallet: string; coins: number; spendable: number; correctionDue: number; rating: number; wins: number; losses: number; draft: SeasonDraft };
  roster: SeasonBot[]; archive: SeasonBot[]; daily: SeasonDaily; shop: SeasonShopItem[]; tradeBonus: SeasonTradeBonus;
  activeMatchId: string | null; message?: string;
  collections?: { seasonId: string; name: string; coins: number; spendable: number; correctionDue: number; parts: string[]; botCount: number }[];
  history?: { id: string; mode: SeasonMode; attackerName: string; defenderName: string; attackerBotId: string | null; defenderBotId: string | null; viewerSide: 0 | 1; winner: 0 | 1 | null; finishedAt: string; revengeBotId: string | null }[];
  standings?: { rank: number; wallet: string; rating: number; wins: number; losses: number; botId: string | null; botName: string; gp: number | null }[];
  rivalries?: { wallet: string; rivalName: string; rivalBotId: string | null; played: number; wins: number; losses: number; draws: number; ownAttacks: number; defenses: number; lastMatchId: string; lastFoughtAt: string }[];
}
export interface SeasonInputReceipt { inputId: string; kind: "special"; frame: number; accepted: boolean; reason?: string }
export interface SeasonSettlement {
  playCoins: number; tradeBonus: number; rewarded: boolean; objectiveCoins: number; ratingChange: number;
  defenderRatingChange: number; repairUntil: string | null; finishedAt: string; winner: 0 | 1 | null;
}
export interface SeasonMatch {
  id: string; seasonId: string; botId: string | null; mode: SeasonMode; requestedMode: SeasonMode;
  revision: number; engineVersion: 6; status: "running" | "settlement-pending" | "complete";
  serverNow: number; startedAt: string; seed: number; tick: number; builds: [BuildV6, BuildV6]; state: StateV6;
  playbackAvailable: boolean;
  rules: Record<string, unknown>; inputs: SeasonInputReceipt[];
  identities: [{ name: string; botId: string | null }, { name: string; botId: string | null }];
  result: unknown | null; settlement: SeasonSettlement | null;
  viewerSide?: 0 | 1;
}
export interface SeasonMatchResponse { ok: true; session: SeasonMatch; input?: SeasonInputReceipt }
export interface SeasonErrorResponse { ok: false; error: { code: string; message: string } }
export interface SeasonStartInput { requestId: string; mode: SeasonMode; botId?: string; targetBotId?: string }

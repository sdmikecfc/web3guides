/** Private self-only dashboard contract. Safe to import into client components. */
export type DashboardSource = "available" | "partial" | "unavailable";
export interface DashboardTradingScope {
  source: DashboardSource;
  /** Confirmed strategy grants only; not gross wallet turnover or manual trades. */
  countedUsd: number | null;
  tradeCoins: number | null;
  roiBonusCoins: number | null;
}
export interface DashboardBattle {
  id: string; createdAt: string; mode: "pve" | "pvp"; difficulty: string | null;
  botName: string; opponentName: string; outcome: "win" | "loss" | "unknown";
  replayUrl: string; rewardCoins: number | null; stakePayout: number | null; houseBonus: number | null;
}
export interface DashboardView {
  ok: true; wallet: string; updatedAt: string;
  coins: { source: DashboardSource; balance: number | null; reserved: number | null; spendable: number | null };
  trading: {
    lifetime: DashboardTradingScope & { since: string | null; through: string | null };
    campaign: DashboardTradingScope & { id: string | null; title: string | null; startsAt: string | null; endsAt: string | null };
    strategies: "available"; mcp: "coming-soon";
  };
  battles: {
    source: DashboardSource; scope: "lifetime-paid-fights";
    fought: number | null; wins: number | null; losses: number | null;
    coins: {
      source: DashboardSource; rewards: number | null; stakeReturned: number | null;
      stakeWon: number | null; houseBonus: number | null; stakeSpent: number | null; net: number | null;
    };
    recent: DashboardBattle[];
  };
  /** Highest win count, then level, current part total, and oldest bot id. */
  bestBot: { source: DashboardSource; botId: number | null; name: string | null; wins: number | null; losses: number | null; level: number | null; total: number | null };
}

import type { Socket } from "./fixtures";
import type { BeginnerOffer } from "./beginner-catalog";

export interface OnboardingPurchase { partId: number; offerId: string }
export interface OnboardingView {
  version: 1;
  step: "welcome" | "shop" | "practice" | "complete";
  welcomeBotId: number;
  welcomeBay: number;
  draftBotId: number;
  draftBay: number;
  allowance: 250;
  reservedCoins: number;
  purchases: Record<Socket, OnboardingPurchase | null>;
  nextSocket: Socket | null;
  purchasedCount: number;
  practiceFightId: string | null;
  milestones: { welcomed: boolean; assembled: boolean; practiced: boolean; completed: boolean };
  offers: readonly BeginnerOffer[];
}
export interface CoinBalance { total: number; reserved: number; spendable: number }
export interface CampaignEnrollmentView {
  campaignId: string | null;
  campaignStatus: "active" | "draft" | "unavailable";
  snapshotStatus: "pending" | "ready" | "failed";
}

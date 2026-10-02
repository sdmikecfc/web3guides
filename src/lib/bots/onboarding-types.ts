import type { Build, Socket } from "./fixtures";
import type { BeginnerOffer } from "./beginner-catalog";

export interface OnboardingPurchase { partId: number; offerId: string }
export interface OnboardingView {
  version: 1 | 2;
  /** Missing on saved earlier drafts. Their original catalogue stays available. */
  catalogueVersion?: 1 | 2;
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
  /** Version 2 choices are previews until the explicit Finish transaction. */
  revision?: number;
  draftOffers?: Record<Socket, string | null>;
  draftName?: Build["name"];
}
export interface CoinBalance { total: number; reserved: number; spendable: number }
export interface CampaignEnrollmentView {
  campaignId: string | null;
  campaignStatus: "active" | "draft" | "unavailable";
  snapshotStatus: "pending" | "ready" | "failed";
}

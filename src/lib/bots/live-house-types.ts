import type { StateV5, BuildV5 } from "./v5";
import type { resultV5 } from "./v5";
import type { Difficulty } from "@/app/bots/_engine/rewards";
import type { LookView } from "@/app/bots/_server/types";

export interface LiveInputReceipt {
  inputId: string;
  kind: "special";
  frame: number;
  accepted: boolean;
  reason?: string;
}
export interface LiveHouseSession {
  id: string;
  botId: number;
  revision: number;
  engineVersion: 5;
  balanceVersion: string;
  difficulty: Difficulty;
  serverNow: number;
  startedAt: string;
  tick: number;
  status: "running" | "settlement-pending" | "complete";
  rules: Record<string, unknown>;
  builds: [BuildV5, BuildV5];
  state: StateV5;
  events: StateV5["events"];
  inputs: LiveInputReceipt[];
  identities: [{ name: string; look: LookView }, { name: string; look: LookView }];
  result: ReturnType<typeof resultV5> | null;
  settlement: { coins: number; points: number; xp: number; dropPartId: number | null; balance: number } | null;
}
export interface LiveHouseResponse { ok: true; session: LiveHouseSession; input?: LiveInputReceipt }

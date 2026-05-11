import type { Metadata } from "next";
import ToolShell from "@/components/ToolShell";
import SecurityScorer from "@/components/SecurityScorer";

export const metadata: Metadata = {
  title: "Crypto Wallet Security Scorer — How Safe Is Your Crypto? | Web3 Guides",
  description:
    "Answer 13 questions and get your personal crypto security score. Find out if your wallet setup, exchange habits, and OpSec are protecting your assets — or leaving you exposed.",
};

export default function SecurityScorePage() {
  return (
    <ToolShell toolLabel="Security Scorer" accentColor="#10b981">
      <SecurityScorer />
    </ToolShell>
  );
}

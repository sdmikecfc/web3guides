import type { Metadata } from "next";
import ToolShell from "@/components/ToolShell";
import AirdropChecker from "@/components/AirdropChecker";

export const metadata: Metadata = {
  title: "Airdrop Eligibility Checker 2026 — Ink, Base, Backpack & More | Web3 Guides",
  description:
    "Check your eligibility for the biggest 2026 crypto airdrops — Ink, Base, Backpack, Polymarket, AIVM. See your score and exactly what to do next to maximise your allocation.",
};

export default function AirdropCheckerPage() {
  return (
    <ToolShell toolLabel="Airdrop Checker" accentColor="#a78bfa">
      <AirdropChecker />
    </ToolShell>
  );
}

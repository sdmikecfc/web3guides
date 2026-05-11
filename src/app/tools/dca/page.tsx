import type { Metadata } from "next";
import ToolShell from "@/components/ToolShell";
import DCACalculator from "@/components/DCACalculator";

export const metadata: Metadata = {
  title: "Bear Market Time Machine — DCA Calculator | Web3 Guides",
  description:
    "What if you'd kept buying through the crash? See exactly what DCA into BTC, ETH or SOL through the 2018, 2022 or 2025 bear markets would be worth today.",
};

export default function DCAPage() {
  return (
    <ToolShell toolLabel="Bear Market Time Machine" accentColor="#F7931A">
      <DCACalculator />
    </ToolShell>
  );
}

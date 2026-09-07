"use client";

/**
 * Client boundary that lazy-loads the Pixi stage (ssr:false). Imports ONLY
 * BootShell eagerly — pulling anything from GameStage here would drag pixi.js
 * into the eager chunk and defeat the split.
 */

import dynamic from "next/dynamic";
import { BOOT_TIPS, BootShell } from "./BootShell";

const GameStage = dynamic(() => import("./GameStage"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "#1b1310",
      }}
    >
      <BootShell progress={0.03} tip={BOOT_TIPS[0]} />
    </div>
  ),
});

export default function GameClient() {
  return <GameStage />;
}

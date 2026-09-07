"use client";

/**
 * VISIT A KITCHEN (CUTE+VIRAL push): walk through somebody else's restaurant.
 *
 * A deliberately THIN host over the same engine and scene the game uses:
 * createWorld from the scrubbed visit payload, autopilot serving (ADR-0102's
 * always-on law means a room is alive with zero input), no verbs, no editing,
 * no saving, no wallet anything. The only interactive pieces are Cheer (the
 * existing board button, so the one-per-day and allowance rules ride along
 * unchanged) and the way home.
 *
 * View-only by construction: nothing here ever calls applyAction, so there is
 * no path by which a visitor mutates a host's kitchen.
 */

import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { createWorld, stepWorld, WORLD_FIXED_DT, type WorldState } from "../../game/_engine/world";
import { SHELL_SIZES } from "../../game/_engine/rooms";
import { loadGameAssets, type ThemeId } from "../../game/_view/preload";
import { buildScene, type Scene } from "../../game/_view/scene";
import { C, FONT, R, S, SHADOW, Z } from "../../game/_ui/tokens";
import { CheerButton } from "../../board/CheerButton";

interface VisitPayload {
  ok: boolean;
  name: string;
  tier: string;
  theme: string;
  shell: number;
  layout: { itemId: string; gx: number; gy: number; facing: "se" | "sw" }[];
  crew: { chef: number; waiter: number };
  hires: { waiters: number; chefs: number };
}

export default function VisitClient({ handle }: { handle: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "gone" | "ready">("loading");
  const [info, setInfo] = useState<{ name: string; tier: string }>({ name: "", tier: "" });

  useEffect(() => {
    let dead = false;
    let app: Application | null = null;
    let scene: Scene | null = null;
    let raf = 0;

    (async () => {
      const res = await fetch(`/api/chef/visit/${encodeURIComponent(handle)}`);
      if (!res.ok) {
        if (!dead) setStatus("gone");
        return;
      }
      const v = (await res.json()) as VisitPayload;
      const host = hostRef.current;
      if (dead || !host) return;
      setInfo({ name: v.name, tier: v.tier });

      const assets = await loadGameAssets(() => {});
      if (dead) return;

      app = new Application();
      await app.init({
        // without this the canvas is Pixi's default 800x600 and the room
        // renders small and left-shifted in the host
        resizeTo: host,
        background: "#1b1310",
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: "webgl",
      });
      if (dead) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.style.position = "absolute";
      app.canvas.style.inset = "0";

      const shellIdx = Math.max(0, Math.min(SHELL_SIZES.length - 1, v.shell));
      const room = SHELL_SIZES[shellIdx];
      const world: WorldState = createWorld(`dk-visit-${handle}`, room, {
        layout: v.layout,
        hires: v.hires,
        shellIdx,
      });
      // let the room warm up so a visitor never walks into an empty hall
      for (let i = 0; i < 60 * 60; i++) stepWorld(world, room);

      scene = buildScene(app, room, assets, (v.theme as ThemeId) || "trattoria");
      scene.setCrew({ chef: v.crew.chef, waiter: v.crew.waiter, chefName: "" });
      scene.setSign(v.name);
      scene.resize(host.clientWidth, host.clientHeight, 56, 96);

      const onResize = () => {
        if (host && scene) scene.resize(host.clientWidth, host.clientHeight, 56, 96);
      };
      window.addEventListener("resize", onResize);

      let acc = 0;
      let last = performance.now();
      const loop = (t: number) => {
        acc += Math.min(0.25, (t - last) / 1000);
        last = t;
        while (acc >= WORLD_FIXED_DT) {
          stepWorld(world, room);
          acc -= WORLD_FIXED_DT;
        }
        scene?.sync(world, null);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      setStatus("ready");

      return () => window.removeEventListener("resize", onResize);
    })();

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      scene?.destroy();
      app?.destroy(true);
    };
  }, [handle]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100dvh", background: "#1b1310", overflow: "hidden", fontFamily: FONT }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

      {status === "gone" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.creamDim, fontSize: 15 }}>
          This kitchen is not on the board any more.
        </div>
      )}

      {/* the visit banner: whose place, how it is doing, cheer, way home */}
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          display: "flex",
          alignItems: "center",
          gap: S.md,
          padding: `${S.sm}px ${S.lg}px`,
          borderRadius: R.pill,
          background: C.panel,
          border: `1px solid ${C.line}`,
          boxShadow: SHADOW.card,
          backdropFilter: "blur(6px)",
          zIndex: Z.hud,
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 800, fontSize: 15, color: C.cream, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {info.name || "A cozy kitchen"}
          </span>
          <span style={{ display: "block", fontSize: 12, color: C.muted }}>
            {status === "ready" ? `${info.tier} · just visiting` : "opening the door..."}
          </span>
        </span>
        {status === "ready" && <CheerButton handle={handle} />}
      </div>

      <a
        href="/chef/game"
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: `calc(14px + env(safe-area-inset-bottom, 0px))`,
          padding: "13px 22px",
          borderRadius: R.pill,
          background: C.amber,
          color: "#1b1310",
          fontWeight: 800,
          fontSize: 14,
          textDecoration: "none",
          boxShadow: SHADOW.card,
          zIndex: Z.hud,
        }}
      >
        Back to my place
      </a>
    </div>
  );
}

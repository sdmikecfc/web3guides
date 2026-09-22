"use client";
/**
 * YOUR BASE, ON THE MAP (Mike, 2026-08-17: "A pop up on the map, not that
 * ugly barracks thing you made"). Ported from S5's GaragePopup
 * (src/app/s5/world/WorldMap.tsx ~1910) under the law written on the donor:
 * the four tabs REUSE the HQ page's panels unchanged - they already take
 * exactly { me, patchMe, dict }, so this is reuse, not a second garage. Any
 * fix to the real garage lands here for free, which is the only reason
 * duplicating the surface is acceptable at all.
 *
 * The mech tab shows the player's CURRENT mech (TankPanel reads `me`); the
 * pilot tab swaps pilots with their portraits (CommanderPanel renders the
 * shared LivingPortrait - idle clip over the knee-up still, reduced-motion
 * aware). Nothing is faked here: whatever the HQ panels render, this renders.
 *
 * The funding wizard is a full flow that carries real money, and it is not
 * something to reimplement inside a card. Both panels that can trigger it
 * hand off to the HQ page. NOTE the hash: S5's donor pointed at "#funding",
 * a hash HqScene has never matched - the deep link that actually opens the
 * wizard is "#wizard" (HqScene.tsx:758; how-to-play and join both use it),
 * so the handoff goes to /s6/hq#wizard.
 *
 * /s6/hq itself STAYS for deep links; only the map interaction becomes this
 * popup (Battlefield intercepts bld-base's route in its onNavigate).
 */
import { useState } from "react";
import { MAP_POPUP_CSS, MapPopup } from "@/app/_world/MapPopup";
import type { S6Dict } from "@/lib/s6/strings";
// The garage panels, opened as a card OVER the battlefield. They already take
// exactly { me, patchMe, dict }, so this is reuse rather than a second garage.
import {
  CommanderPanel,
  FootlockerPanel,
  TankPanel,
  WorkbenchPanel,
  type HqMe,
} from "@/app/s6/hq/panels";

/** Battlefield's LiteTarget rows, narrowed to what FootlockerPanel's decal
 * collection needs (it reads domain/name/status; progress is optional). */
export type BaseTargetLite = {
  domain: string;
  name: string;
  status: string;
  peakPct?: number;
};

export function BasePopup({
  d,
  me,
  patchMe,
  ready,
  targets,
  onClose,
}: {
  d: S6Dict;
  me: HqMe;
  patchMe: (p: Partial<HqMe>) => void;
  /** False while the session lookup is in flight, so the bay does not tell a
   *  signed-in pilot to enlist (TankPanel reads it). */
  ready: boolean;
  /** The season's mainframes. The decal collection needs them to list each
   *  standing wall's breach slot; without them this panel reported a different
   *  total here than it did in the HQ (the S5 lesson, kept). */
  targets: BaseTargetLite[];
  onClose: () => void;
}) {
  const TABS = [
    { key: "tank", label: d.world.tabTank },
    { key: "pilot", label: d.world.tabPilot },
    { key: "workbench", label: d.world.tabUpgrades },
    { key: "kit", label: d.world.tabKit },
  ] as const;
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tank");

  const openWizard = () => {
    window.location.href = "/s6/hq#wizard";
  };

  return (
    <div className="s6bp">
      <MapPopup title={d.world.baseTitle} ariaLabel="your base" accent="#f0b340" onClose={onClose}>
        <div className="wm-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`wm-tab${tab === t.key ? " is-on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* No `!me` branch here, deliberately: s6's useHqMe seeds guest
            defaults synchronously (me is never null), exactly like the HQ
            page, and TankPanel's `ready` covers the in-flight lookup. */}
        <div className="wm-tabbody">
          {tab === "tank" ? (
            <TankPanel me={me} patchMe={patchMe} dict={d} onOpenWizard={openWizard} ready={ready} />
          ) : null}
          {tab === "pilot" ? <CommanderPanel me={me} patchMe={patchMe} dict={d} /> : null}
          {tab === "workbench" ? <WorkbenchPanel me={me} patchMe={patchMe} dict={d} /> : null}
          {tab === "kit" ? (
            <FootlockerPanel
              me={me}
              patchMe={patchMe}
              dict={d}
              onOpenWizard={openWizard}
              targets={targets.map((t) => ({
                domain: t.domain,
                name: t.name,
                status: t.status,
                progress: t.peakPct,
              }))}
            />
          ) : null}
        </div>
      </MapPopup>
      <style dangerouslySetInnerHTML={{ __html: BASE_POPUP_CSS }} />
    </div>
  );
}

/**
 * The popup shell CSS rides along because the battlefield does not use
 * WorldViewport (which is what injects MAP_POPUP_CSS on the S5 world map).
 * The tab styles are the donor's wm-tabs block from WorldMap.tsx's HUD_CSS,
 * byte-for-byte where possible.
 */
const BASE_POPUP_CSS = `
${MAP_POPUP_CSS}
/* Above the fixed S6TopNav (zIndex 1000); the shared shell's 120 was tuned
   for the S5 world map, which has no fixed season nav over it. */
.s6bp .wm-scrim{z-index:1200;}
.wm-tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap;}
.wm-tab{
  appearance:none;border:1px solid rgba(255,255,255,0.18);
  background:rgba(255,255,255,0.05);color:#c9d2da;
  font-family:'Space Mono',ui-monospace,monospace;font-size:11.5px;font-weight:700;
  letter-spacing:0.03em;text-transform:uppercase;
  padding:7px 11px;border-radius:7px;cursor:pointer;
}
.wm-tab:hover{background:rgba(255,255,255,0.10);color:#eef2f6;}
.wm-tab.is-on{background:#e0662e;border-color:#e0662e;color:#fff;}
.wm-tabbody{max-height:min(62vh,560px);overflow-y:auto;overscroll-behavior:contain;}
.wm-note{margin:10px 0 0;font-size:12.5px;line-height:1.55;color:#aab4bd;}
`;

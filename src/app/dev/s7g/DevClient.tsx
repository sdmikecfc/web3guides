"use client";
/**
 * GAUNTLET dev harness: class picker, level slider, gear tier selects, seed
 * input, restart, final-score readout. Every control change remounts the
 * Client (key) so a run always starts clean from the chosen loadout.
 */

import { useMemo, useState } from "react";
import { CLASS_IDS, type ClassId, type Loadout } from "../../s7/games/_shared/rules/core";
import GauntletClient from "../../s7/games/gauntlet/Client";

const ACCENT: Record<ClassId, string> = {
  barbarian: "#e07030",
  monk: "#3fae8a",
  ranger: "#3f7a3f",
  bard: "#6a5adf",
  wizard: "#3f6adf",
  cleric: "#d8b13f",
};

const TIERS = [0, 1, 2, 3] as const;

const selStyle: React.CSSProperties = {
  background: "#141924",
  color: "#e8e2d2",
  border: "1px solid #3d4454",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};

export default function DevClient() {
  const [classId, setClassId] = useState<ClassId>("barbarian");
  const [level, setLevel] = useState(1);
  const [weapon, setWeapon] = useState(0);
  const [armor, setArmor] = useState(0);
  const [trinket, setTrinket] = useState(0);
  const [seed, setSeed] = useState("dev-gauntlet-1");
  const [useLoadout, setUseLoadout] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const loadout: Loadout | null = useMemo(
    () => (useLoadout ? { classId, level, gear: { weapon, armor, trinket } } : null),
    [useLoadout, classId, level, weapon, armor, trinket],
  );
  const runKey = `${useLoadout ? classId : "null"}-${level}-${weapon}${armor}${trinket}-${seed}-${nonce}`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(1000px 500px at 50% -10%, #171c22 0%, #0b0d10 60%)",
        color: "#e9edf1",
        padding: "28px 16px 56px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 14, letterSpacing: 3, color: "#f0b340", textTransform: "uppercase", fontWeight: 800 }}>
            Gauntlet · dev free play
          </span>
          <span style={{ fontSize: 12, color: "#87919b" }}>
            Final score: <strong style={{ color: "#f0b340" }}>{lastScore ?? "-"}</strong>
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
          {CLASS_IDS.map((c) => (
            <button
              key={c}
              onClick={() => setClassId(c)}
              style={{
                padding: "7px 12px",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                background: classId === c && useLoadout ? ACCENT[c] : "#141924",
                color: classId === c && useLoadout ? "#10120a" : ACCENT[c],
                border: `1px solid ${ACCENT[c]}`,
                opacity: useLoadout ? 1 : 0.4,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 8, fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: useLoadout ? 1 : 0.4 }}>
            Level {level}
            <input
              type="range"
              min={1}
              max={20}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              style={{ width: 140 }}
            />
          </label>
          {(
            [
              ["weapon", weapon, setWeapon],
              ["armor", armor, setArmor],
              ["trinket", trinket, setTrinket],
            ] as const
          ).map(([name, val, set]) => (
            <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, opacity: useLoadout ? 1 : 0.4 }}>
              {name}
              <select value={val} onChange={(e) => set(Number(e.target.value))} style={selStyle}>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    T{t}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={!useLoadout} onChange={(e) => setUseLoadout(!e.target.checked)} />
            null loadout
          </label>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14, fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            seed
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              style={{ ...selStyle, width: 200 }}
              spellCheck={false}
            />
          </label>
          <button
            onClick={() => {
              setLastScore(null);
              setNonce((n) => n + 1);
            }}
            style={{
              padding: "8px 18px",
              background: "#f0b340",
              color: "#1a1205",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Restart
          </button>
          <span style={{ color: "#87919b", fontSize: 12 }}>
            Tap cards / doors, right band or Space ends the turn. Silence makes you cower.
          </span>
        </div>

        <GauntletClient key={runKey} loadout={loadout} seed={seed} onDone={(sc) => setLastScore(sc)} />
      </div>
    </main>
  );
}

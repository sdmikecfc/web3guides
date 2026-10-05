/**
 * THE FRONT SET EDITOR (/s7/front/editor) - Mike authors the battlefield's
 * set dressing here (the seed never designs). Place buildings + props on the
 * wash, drag the 10 domain keeps, then SAVE (localhost dev only): the route
 * rewrites ONLY the two array bodies in src/app/s7/front/setdressing.ts,
 * keeping BUILDING_ROUTES and the law comments intact. EXPORT copies the
 * FRONT_LAYOUT snippet to the clipboard as a fallback. Not linked from nav.
 *
 *  click palette item, then click the map = place
 *  drag placed item = move        wheel over item = scale
 *  F = flip          Delete/Backspace = remove       drag empty = pan preview
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { FRONT_LAYOUT, MILESTONE_SPOTS, type LayoutItem } from "../setdressing";

const KEYS = [
  "bld-base", "bld-board", "bld-ironjaw", "bld-strain", "bld-stopclock",
  "bld-arcade", "bld-challenges", "bld-kitchen", "bld-riot",
  "prop-tree-oak", "prop-tree-pine", "prop-tree-dead", "prop-ruin-house",
  "prop-ruin-tower", "prop-statue-hero", "prop-statue-fallen",
  "prop-wreck-hero", "prop-sandbags", "prop-watertower",
  "war-camp",
];

/** S7 set art wins when it exists; the S6 baked set stays the fallback
 * (mirrors the scene's loader). The fallback lives in STATE, not a bare
 * onError src swap: the server-rendered tag can finish 404ing before React
 * attaches the handler (the error event never re-fires), which left every
 * S6-fallback prop invisible in the palette AND on the board. A mount check
 * catches an image that already died, onError catches one that dies later. */
const setSrc = (k: string) => `/s7-art/front/set/${k}.png`;

type SetImgProps = { k: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError">;
function SetImg({ k, ...rest }: SetImgProps) {
  const [src, setImgSrc] = useState(() => setSrc(k));
  const ref = useRef<HTMLImageElement | null>(null);
  const toS6 = () => setImgSrc((s) => (s.startsWith("/s6-art/") ? s : `/s6-art/front/set/${k}.png`));
  useEffect(() => setImgSrc(setSrc(k)), [k]);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) toS6();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, k]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} onError={toS6} alt={rest.alt ?? k} {...rest} />;
}

const SIM_W = 2600;
const SIM_H = 1080;

// READ-ONLY reference: where the 10 domain keeps stand (mirror of
// Battlefield.milestoneXs + scene FORT_Y + the +56 behind-the-line offset),
// so set dressing is placed around them, never under them.
const DOMAINS = ["forge.keep", "haven.realm", "raven.watch", "vault.crypt", "hexline.ai",
  "lich.throne", "valor.fields", "ember.vale", "stone.march", "realm.crown"];

export default function FrontEditor() {
  const [items, setItems] = useState<LayoutItem[]>(() => [...FRONT_LAYOUT]);
  const [spots, setSpots] = useState(() => MILESTONE_SPOTS.map((m) => ({ ...m })));
  const [saved, setSaved] = useState("");
  const msDragRef = useRef<{ idx: number; dx: number; dy: number } | null>(null);
  const [brush, setBrush] = useState<string | null>(null);
  const [sel, setSel] = useState<number>(-1);
  const [exported, setExported] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ idx: number; dx: number; dy: number } | null>(null);

  const toSim = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * SIM_W),
      y: Math.round(((e.clientY - r.top) / r.height) * SIM_H),
    };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sel < 0) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        setItems((it) => it.filter((_, i) => i !== sel));
        setSel(-1);
      } else if (e.key.toLowerCase() === "f") {
        setItems((it) => it.map((x, i) => (i === sel ? { ...x, flip: !x.flip } : x)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const doSave = async () => {
    setSaved("saving...");
    try {
      const r = await fetch("/api/s7/dev-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, milestones: spots }),
      });
      const j = await r.json();
      setSaved(j.ok ? "SAVED - setdressing.ts written" : `save failed: ${j.error ?? r.status}`);
    } catch (e) {
      setSaved(`save failed: ${String(e)}`);
    }
  };

  const doExport = () => {
    const rows = items
      .map(
        (it) =>
          `  { key: "${it.key}", x: ${it.x}, y: ${it.y}, s: ${Number(it.s.toFixed(2))}${it.flip ? ", flip: true" : ""} },`,
      )
      .join("\n");
    const txt = `export const FRONT_LAYOUT: LayoutItem[] = [\n${rows}\n];`;
    setExported(txt);
    void navigator.clipboard?.writeText(txt).catch(() => {});
  };

  return (
    <main style={{ padding: 12, background: "#0b0d12", minHeight: "100dvh", color: "#f0f0eb", fontFamily: "Segoe UI, sans-serif" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <strong style={{ letterSpacing: "0.1em" }}>FRONT SET EDITOR</strong>
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setBrush(brush === k ? null : k)}
            title={k}
            style={{
              padding: 4, borderRadius: 8, cursor: "pointer", width: 74,
              border: `2px solid ${brush === k ? "#f0b340" : "#2a3345"}`,
              background: brush === k ? "#3a2f16" : "#141821", color: "#f0f0eb",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}
          >
            <SetImg k={k} alt={k} draggable={false} style={{ width: 56, height: 46, objectFit: "contain" }} />
            <span style={{ fontSize: 9.5, whiteSpace: "nowrap" }}>{k.replace("prop-", "").replace("bld-", "B:")}</span>
          </button>
        ))}
        <button onClick={doSave} style={{ padding: "4px 14px", borderRadius: 6, fontWeight: 800, background: "#34d399", border: 0, cursor: "pointer" }}>
          SAVE
        </button>
        <button onClick={doExport} style={{ padding: "4px 12px", borderRadius: 6, fontWeight: 700, background: "#e0662e", border: 0, cursor: "pointer" }}>
          EXPORT (copies)
        </button>
        {saved ? <span style={{ fontSize: 11, color: saved.startsWith("SAVED") ? "#34d399" : "#ff5c48" }}>{saved}</span> : null}
        <span style={{ fontSize: 11, color: "#8a93a2" }}>click=place drag=move wheel=scale F=flip Del=remove</span>
      </div>
      <div
        ref={boxRef}
        style={{
          position: "relative", width: "100%", aspectRatio: `${SIM_W}/${SIM_H}`,
          backgroundImage: "url(/s7-art/front/wash.webp)", backgroundSize: "100% 100%",
          borderRadius: 8, overflow: "hidden", cursor: brush ? "crosshair" : "default",
        }}
        onPointerDown={(e) => {
          if (brush) {
            const p = toSim(e);
            setItems((it) => [...it, { key: brush, x: p.x, y: p.y, s: 1 }]);
            setSel(items.length);
            setBrush(null); // one placement per pick - no accidental spam
          } else setSel(-1);
        }}
      >
        {/* domain keeps: DRAGGABLE stands (index = ladder rank) */}
        {spots.map((m, i) => (
          <div
            key={`ms-${i}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              const p = toSim(e);
              msDragRef.current = { idx: i, dx: p.x - m.x, dy: p.y - m.y };
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = msDragRef.current;
              if (!d || d.idx !== i) return;
              const p = toSim(e);
              setSpots((arr) => arr.map((x, j) => (j === i ? { x: p.x - d.dx, y: p.y - d.dy } : x)));
            }}
            onPointerUp={() => (msDragRef.current = null)}
            style={{
              position: "absolute",
              left: `${(m.x / SIM_W) * 100}%`,
              top: `${(m.y / SIM_H) * 100}%`,
              transform: "translate(-50%, -100%)",
              cursor: "move",
              textAlign: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/s7-art/keeps/keep-cursed.png" alt={DOMAINS[i]} style={{ width: 58 }} draggable={false} />
            <div
              style={{
                fontSize: 10, fontWeight: 800, color: "#8fe2ff",
                background: "rgba(10,12,18,0.9)", border: "1px solid #2a5a74",
                borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap",
              }}
            >
              {DOMAINS[i]}
            </div>
          </div>
        ))}
        {items.map((it, i) => {
          const w = (it.key.startsWith("bld-") ? 380 : 260) * 0.5 * it.s;
          const label = it.key.replace("prop-", "").replace("bld-", "");
          return (
            <SetImg
              key={i}
              k={it.key}
              alt={it.key}
              draggable={false}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSel(i);
                const p = toSim(e);
                dragRef.current = { idx: i, dx: p.x - it.x, dy: p.y - it.y };
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d || d.idx !== i) return;
                const p = toSim(e);
                setItems((arr) => arr.map((x, j) => (j === i ? { ...x, x: p.x - d.dx, y: p.y - d.dy } : x)));
              }}
              onPointerUp={() => (dragRef.current = null)}
              onWheel={(e) => {
                e.preventDefault();
                setItems((arr) =>
                  arr.map((x, j) =>
                    j === i ? { ...x, s: Math.max(0.3, Math.min(2.5, x.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) } : x,
                  ),
                );
              }}
              style={{
                position: "absolute",
                left: `${(it.x / SIM_W) * 100}%`,
                top: `${(it.y / SIM_H) * 100}%`,
                width: `${(w / SIM_W) * 100}%`,
                transform: `translate(-50%, -100%) scaleX(${it.flip ? -1 : 1})`,
                outline: sel === i ? "2px solid #f0b340" : "none",
                cursor: "move",
              }}
            />
          );
        })}
        {/* always-visible labels + a remove button on the selected item */}
        {items.map((it, i) => (
          <div
            key={`lbl-${i}`}
            style={{
              position: "absolute",
              left: `${(it.x / SIM_W) * 100}%`,
              top: `${(it.y / SIM_H) * 100}%`,
              transform: "translate(-50%, 2px)",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: sel === i ? "#f0b340" : "#f0f0eb",
                background: "rgba(10,12,18,0.85)",
                border: `1px solid ${sel === i ? "#f0b340" : "#2a3345"}`,
                borderRadius: 5,
                padding: "1px 5px",
                whiteSpace: "nowrap",
              }}
            >
              {it.key.replace("prop-", "").replace("bld-", "B:")}
            </span>
            {sel === i ? (
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setItems((arr) => arr.filter((_, j) => j !== i));
                  setSel(-1);
                }}
                style={{
                  pointerEvents: "auto",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#0b0d10",
                  background: "#ff5c48",
                  border: 0,
                  borderRadius: 5,
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  lineHeight: "16px",
                }}
              >
                x
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {exported ? (
        <pre style={{ fontSize: 10, background: "#141821", padding: 10, borderRadius: 8, marginTop: 8, maxHeight: 200, overflow: "auto" }}>
          {exported}
        </pre>
      ) : null}
    </main>
  );
}

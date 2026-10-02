"use client";

/**
 * M3b chrome (ADR-0101): the top-right chip bar (sound, menu, guest book)
 * and the two modals. DOM/React only. Player copy: 6th grade, kind, no
 * em-dashes, never "win $X". The menu modal is the ADR-0090 stub: the house
 * special is unlocked by participation, mastered by serving, cosmetic only.
 */

import { useState } from "react";
import type { DailyState, MenuState, Moment, PantryState, Regular } from "./_engine/world";
import { REGULAR_NAMES, SPECIAL_MASTERY } from "./_engine/world";
import {
  DAILY_SPECIALS,
  ingredient,
  INGREDIENTS,
  MAX_DISH_LEVEL,
  nextRecipe,
} from "./_engine/pantry";
import { itemDef } from "./_engine/items";
import { THEME_IDS, THEME_META, type ThemeId } from "./_view/preload";

import { FONT } from "./_ui/tokens";
import { Sheet } from "./_ui/primitives";

/**
 * Dish DISPLAY names per country style. The sim only knows stable keys
 * (margherita/caciopepe/tiramisu), so re-theming never touches world state or
 * determinism: it is pure presentation, exactly like the room art.
 */
const THEME_MENUS: Record<ThemeId, { names: [string, string, string]; special: string }> = {
  trattoria: { names: ["Margherita", "Cacio e Pepe", "Tiramisu"], special: "House Special" },
  izakaya: { names: ["Shoyu Ramen", "Karaage", "Matcha Mochi"], special: "House Special" },
  taqueria: { names: ["Al Pastor", "Elote", "Churros"], special: "House Special" },
  diner: { names: ["Smash Burger", "Blue Plate", "Milkshake"], special: "House Special" },
  bistro: { names: ["Croque Monsieur", "Steak Frites", "Creme Brulee"], special: "House Special" },
};

/**
 * A dish key as the player currently sees it. The sim keeps stable keys and
 * the country style renames them for display only (the M3c rule that let five
 * themes ship without touching the sim hash), so anything showing a dish by
 * key has to come through here.
 */
const DISH_ORDER = ["margherita", "caciopepe", "tiramisu"];
function dishLabel(theme: ThemeId, key: string): string {
  const i = DISH_ORDER.indexOf(key);
  if (i < 0) return THEME_MENUS[theme].special;
  return THEME_MENUS[theme].names[i] ?? key;
}

const chip: React.CSSProperties = {
  flexShrink: 0,
  whiteSpace: "nowrap",
  background: "rgba(27,19,16,0.92)",
  border: "1px solid #4a3626",
  borderRadius: 999,
  color: "#f3e9d2",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 13px",
  cursor: "pointer",
  // kills the double-tap-to-zoom gesture and the 300ms tap delay that comes
  // with it. The game host already sets this; the chips sit above it in their
  // own stacking context and need it too.
  touchAction: "manipulation",
};

/**
 * Touch sizing. Measured under device emulation, every chip came out 38px
 * tall, under Apple's 44px minimum target: fine under a mouse, fiddly under a
 * thumb. Only the narrow layout pays the extra height, so the desktop bar
 * stays compact.
 */
const touchChip: React.CSSProperties = { ...chip, padding: "11px 14px", minHeight: 44 };
const chipFor = (narrow?: boolean) => (narrow ? touchChip : chip);

/** a country badge that renders on every platform, unlike a flag emoji */
const CodeBadge = ({ code, big }: { code: string; big?: boolean }) => (
  <span
    style={{
      display: "inline-block",
      minWidth: big ? 30 : 22,
      textAlign: "center",
      padding: big ? "3px 6px" : "1px 4px",
      borderRadius: 6,
      background: "rgba(232,161,61,0.16)",
      border: "1px solid rgba(232,161,61,0.42)",
      color: "#e8a13d",
      fontSize: big ? 12 : 11,
      fontWeight: 800,
      letterSpacing: "0.06em",
      lineHeight: 1.5,
    }}
  >
    {code}
  </span>
);

export function ChipBar({
  muted,
  theme,
  editing,
  onMute,
  onMenu,
  onBook,
  onStyle,
  onCrew,
  onEdit,
  onAcademy,
  graduate,
  narrow,
}: {
  muted: boolean;
  theme: ThemeId;
  editing: boolean;
  /** phone layout: one sideways-scrolling row across the whole top edge */
  narrow?: boolean;
  onMute: () => void;
  onMenu: () => void;
  onBook: () => void;
  onStyle: () => void;
  onCrew: () => void;
  onEdit: () => void;
  onAcademy: () => void;
  graduate: boolean;
}) {
  return (
    // Bounded on the left so it can never reach the position card's column
    // (at 900px wide the sound chip sat on top of that card's collapse caret),
    // and allowed to wrap rather than collide when the viewport gets narrow.
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        // On a phone the panels live at the BOTTOM, so the bar gets the whole
        // top edge and scrolls sideways as one row rather than wrapping into a
        // vertical stack over the room. On desktop it stays clear of the left
        // column, where it used to sit on that card's collapse caret at 900px.
        left: narrow ? 12 : "auto",
        maxWidth: narrow ? undefined : "calc(100% - 286px)",
        display: "flex",
        flexWrap: narrow ? "nowrap" : "wrap",
        overflowX: narrow ? "auto" : "visible",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        justifyContent: narrow ? "flex-start" : "flex-end",
        gap: 8,
        rowGap: 8,
        paddingBottom: narrow ? 2 : 0,
        zIndex: 6,
      }}
    >
      <button style={chipFor(narrow)} onClick={onMute} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
        {muted ? "🔇" : "🔊"}
      </button>
      <button
        style={{
          ...chipFor(narrow),
          borderColor: editing ? "#e8a13d" : "#4a3626",
          background: editing ? "#2f2016" : "rgba(27,19,16,0.92)",
        }}
        onClick={onEdit}
        aria-label={editing ? "Finish arranging" : "Arrange the room"}
      >
        {editing ? "✓ Done" : "🔧 Arrange"}
      </button>
      <button style={chipFor(narrow)} onClick={onStyle} aria-label="Change restaurant style">
        <CodeBadge code={THEME_META[theme].code} /> Style
      </button>
      <button style={chipFor(narrow)} onClick={onCrew} aria-label="Choose your crew">
        👩‍🍳 Crew
      </button>
      <button
        style={{ ...chipFor(narrow), borderColor: graduate ? "#e8a13d" : "#4a3626" }}
        onClick={onAcademy}
        aria-label="The Academy"
      >
        {graduate ? "🎓" : "📚"} Learn
      </button>
      <button style={chipFor(narrow)} onClick={onMenu}>
        🍝 Menu
      </button>
      <button style={chipFor(narrow)} onClick={onBook}>
        📖 Book
      </button>
      {/* the public spotlight (ADR-0111) */}
      <a
        href="/chef/board"
        style={{ ...chipFor(narrow), textDecoration: "none", display: "inline-block" }}
        aria-label="The best tables in town"
      >
        🏅 Board
      </a>
    </div>
  );
}

/**
 * The edit-mode tray (ADR-0104): what you own but have not placed, plus the
 * controls for the piece currently in hand. Copy stays kind: a refusal
 * explains itself and never blames the player.
 */
export function EditTray({
  inventory,
  holdingItemId,
  liftUid,
  error,
  onPickItem,
  onRotate,
  onStore,
  onCancel,
}: {
  inventory: Record<string, number>;
  holdingItemId: string;
  liftUid: number;
  error: string;
  onPickItem: (itemId: string) => void;
  onRotate: () => void;
  onStore: () => void;
  onCancel: () => void;
}) {
  const entries = Object.entries(inventory).filter(([, n]) => n > 0);
  const holding = holdingItemId || liftUid >= 0;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 12,
        width: "min(460px, 94vw)",
        background: "rgba(27,19,16,0.94)",
        border: "1px solid #4a3626",
        borderRadius: 14,
        color: "#f3e9d2",
        fontFamily: FONT,
        fontSize: 12,
        padding: "10px 12px",
        zIndex: 6,
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 28px rgba(8,4,2,0.5), inset 0 1px 0 rgba(255,240,214,0.07)",
      }}
    >
      <div style={{ fontWeight: 800, letterSpacing: "0.04em", marginBottom: 4 }}>
        🔧 ARRANGING
      </div>
      <div style={{ opacity: 0.72, lineHeight: 1.35 }}>
        {holding
          ? "Tap a floor tile to set it down. Green means it fits."
          : "Tap anything in the room to pick it up, or choose from storage below."}
      </div>
      {error && (
        <div style={{ marginTop: 6, color: "#ff9a9a", fontWeight: 700, lineHeight: 1.35 }}>
          {error}
        </div>
      )}
      {holding && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={chip} onClick={onRotate}>
            ↻ Turn
          </button>
          {liftUid >= 0 && (
            <button style={chip} onClick={onStore}>
              📦 Put away
            </button>
          )}
          <button style={chip} onClick={onCancel}>
            ✕ Never mind
          </button>
        </div>
      )}
      <div style={{ marginTop: 9, opacity: 0.72 }}>Storage</div>
      {entries.length === 0 ? (
        <div style={{ opacity: 0.55, marginTop: 3, lineHeight: 1.35 }}>
          Nothing waiting. Buy furniture in the shop and it lands here.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
          {entries.map(([itemId, n]) => {
            const def = itemDef(itemId);
            const active = itemId === holdingItemId;
            return (
              <button
                key={itemId}
                onClick={() => onPickItem(itemId)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: `1px solid ${active ? "#e8a13d" : "#4a3626"}`,
                  background: active ? "#2f2016" : "#1f150f",
                  color: "#f3e9d2",
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {def?.label ?? itemId} <span style={{ opacity: 0.6 }}>x{n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The game's modal shell, now a thin wrapper over the shared Sheet (M11).
 *
 * This used to be one of THREE hand-rolled modal implementations (the others
 * lived in Academy.tsx and AddLiquidityModal.tsx) and they had already drifted
 * apart: different backdrop alphas, radii, max-heights and close buttons.
 * Keeping the local name means Crew, Style, Menu and Book all migrate to the
 * bottom-sheet treatment with zero call-site churn.
 */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ fontSize: 13 }}>{children}</div>
    </Sheet>
  );
}

/**
 * YOUR CREW (M7d). "Your chef is you": pick the face of the two characters you
 * actually watch all day, and name your chef.
 *
 * Portraits come straight from the shipped Pixi atlas as a plain <img> with a
 * CSS-cropped background, the same trick DialsPanel uses for shop thumbnails.
 * That means the picker shows the REAL sprite with no second copy of the art
 * and no Pixi involvement.
 *
 * Cosmetic only. Nothing here touches speed, quality, income or any sim number
 * (ADR-0067/0090/0103/0105), and it needs no wallet.
 */
function CrewFace({ sheet, look }: { sheet: "chef" | "waiter"; look: number }) {
  // WHICH CELL. dk-atlas packs strips in ALPHABETICAL filename order into a
  // 5-column sheet, which puts the only front-facing frame of each role at the
  // same place by coincidence: chef walk_f_0 and waiter idle_f_0 are both at
  // col 3, row 1. Verified against the shipped chef0.json / waiter0.json, and
  // dk-art-check.mts asserts it so a renamed animation cannot silently turn
  // this picker into six identical shots of the back of someone's head, which
  // is exactly what the first version showed.
  //
  // FRAMING. Drawing the whole 128px cell into a 46px chip puts the head at
  // ~17px, where the faces that actually differ between looks are invisible.
  // So this zooms in on the head instead: the bake puts the head centre at
  // roughly (64, 44) of every cell, feet on the y=116 baseline.
  const CELL = 128;
  const COLS = 5;
  const BOX = 52;
  const ZOOM = 1.55; // one cell renders at ~1.55x the chip, so the head fills it
  const cellPx = BOX * ZOOM;
  const px = (v: number) => (v / CELL) * cellPx; // cell coords -> screen px
  const col = 3;
  const row = 1;
  return (
    <span
      style={{
        width: BOX,
        height: BOX,
        borderRadius: 12,
        overflow: "hidden",
        flexShrink: 0,
        display: "block",
        background: "rgba(20,14,11,0.55)",
        border: "1px solid rgba(74,54,38,0.9)",
        backgroundImage: `url(/chef-art/chars/${sheet}${look}.png)`,
        backgroundSize: `${COLS * cellPx}px auto`,
        backgroundPosition: `${-(col * cellPx + px(64) - BOX / 2)}px ${-(row * cellPx + px(46) - BOX / 2)}px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

export function CrewModal({
  crew,
  looks,
  nameMax,
  onPick,
  onName,
  onClose,
}: {
  crew: { chef: number; waiter: number; chefName: string };
  looks: number;
  nameMax: number;
  onPick: (next: { chef: number; waiter: number; chefName: string }) => void;
  onName: (name: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"chef" | "waiter">("chef");
  const active = tab === "chef" ? crew.chef : crew.waiter;
  return (
    <Modal title="YOUR CREW" onClose={onClose}>
      <div style={{ opacity: 0.7, lineHeight: 1.4, marginBottom: 10 }}>
        Pick who works here. Looks only: nobody cooks faster or serves better for it.
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["chef", "waiter"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...chip,
              fontSize: 12,
              padding: "6px 12px",
              background: tab === t ? "#2f2016" : "#1f150f",
              borderColor: tab === t ? "#e8a13d" : "#4a3626",
            }}
          >
            {t === "chef" ? "👩‍🍳 Chef" : "🧑‍💼 Waiters"}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {Array.from({ length: looks }, (_, i) => {
          const on = i === active;
          return (
            <button
              key={i}
              onClick={() => onPick({ ...crew, [tab]: i })}
              aria-label={`${tab} look ${i + 1}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
                borderRadius: 12,
                border: `1px solid ${on ? "#e8a13d" : "#4a3626"}`,
                background: on ? "#2f2016" : "#1f150f",
                cursor: "pointer",
              }}
            >
              <CrewFace sheet={tab} look={i} />
            </button>
          );
        })}
      </div>
      {tab === "chef" && (
        <label style={{ display: "block", marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Chef&apos;s name
          <input
            value={crew.chefName}
            onChange={(e) => onName(e.target.value)}
            maxLength={nameMax}
            placeholder="Rosa"
            style={{
              display: "block",
              width: "100%",
              marginTop: 5,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #4a3626",
              background: "#1f150f",
              color: "#f3e9d2",
              fontFamily: FONT,
              fontSize: 13,
            }}
          />
          <span style={{ display: "block", marginTop: 5, fontSize: 11, opacity: 0.55 }}>
            Just for you. Your name never shows up on the spotlight board.
          </span>
        </label>
      )}
    </Modal>
  );
}

export function StyleModal({
  theme,
  onPick,
  onClose,
}: {
  theme: ThemeId;
  onPick: (t: ThemeId) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="RESTAURANT STYLE" onClose={onClose}>
      <div style={{ opacity: 0.7, lineHeight: 1.4, marginBottom: 8 }}>
        Pick the kind of place yours is. Everything you built stays exactly where it is.
      </div>
      {THEME_IDS.map((id) => {
        const meta = THEME_META[id];
        const active = id === theme;
        return (
          <button
            key={id}
            onClick={() => onPick(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              padding: "9px 10px",
              marginTop: 6,
              borderRadius: 12,
              border: `1px solid ${active ? "#e8a13d" : "#4a3626"}`,
              background: active ? "#2f2016" : "#1f150f",
              color: "#f3e9d2",
              fontFamily: FONT,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <CodeBadge code={meta.code} big />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 800 }}>{meta.label}</span>
              <span style={{ display: "block", opacity: 0.65, fontSize: 11, lineHeight: 1.3 }}>
                {meta.blurb}
              </span>
            </span>
            {active && <span style={{ color: "#e8a13d", fontWeight: 800 }}>✓</span>}
          </button>
        );
      })}
    </Modal>
  );
}

/** One recipe line: the icons the next level wants, with have/need counts. */
function RecipeLine({
  recipe,
  stock,
}: {
  recipe: Record<string, number>;
  stock: Record<string, number>;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 9, flexWrap: "wrap", alignItems: "baseline" }}>
      {/* "Needs" is doing real work: a bare "0/2" beside an emoji reads as a
          score, not a shopping list, and this is the first screen where a new
          player meets ingredients at all. */}
      <span style={{ opacity: 0.6 }}>Needs</span>
      {Object.entries(recipe).map(([id, need]) => {
        const have = stock[id] ?? 0;
        const ok = have >= need;
        const ing = ingredient(id);
        return (
          <span
            key={id}
            title={ing?.label ?? id}
            style={{ color: ok ? "#e8a13d" : "#f3e9d2", opacity: ok ? 1 : 0.55 }}
          >
            {ing?.icon ?? "•"} {have}/{need}
          </span>
        );
      })}
    </span>
  );
}

function stars(level: number): string {
  return "★".repeat(level) + "☆".repeat(MAX_DISH_LEVEL - level);
}

/** A dish row: level stars, serves, and the next upgrade if one exists. */
function DishRow({
  name,
  dishKey,
  serves,
  level,
  stock,
  canUpgrade,
  onUpgrade,
  accent,
  extra,
}: {
  name: string;
  dishKey: string;
  serves: number;
  level: number;
  stock: Record<string, number>;
  canUpgrade: boolean;
  onUpgrade: (key: string) => void;
  accent?: boolean;
  extra?: React.ReactNode;
}) {
  const recipe = nextRecipe(dishKey, level);
  return (
    <div style={{ padding: "8px 0", borderTop: "1px solid rgba(74,54,38,0.6)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, color: accent ? "#e8a13d" : undefined }}>
          {name} <span style={{ color: "#e8a13d", letterSpacing: 1 }}>{stars(level)}</span>
        </span>
        <span style={{ opacity: 0.65 }}>served {serves}</span>
      </div>
      {extra}
      {recipe && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
          <div style={{ flex: 1, minWidth: 0, opacity: 0.85 }}>
            <RecipeLine recipe={recipe} stock={stock} />
          </div>
          <button
            onClick={() => canUpgrade && onUpgrade(dishKey)}
            disabled={!canUpgrade}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              border: `1px solid ${canUpgrade ? "#e8a13d" : "#4a3626"}`,
              // filled when it is actually possible, matching the shop's Buy
              background: canUpgrade ? "#e8a13d" : "#241a14",
              color: canUpgrade ? "#1b1310" : "#8a7a63",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 800,
              cursor: canUpgrade ? "pointer" : "default",
              whiteSpace: "nowrap",
              boxShadow: canUpgrade ? "0 1px 6px rgba(232,161,61,0.28)" : "none",
            }}
          >
            Cook it better
          </button>
        </div>
      )}
      {!recipe && (
        <div style={{ opacity: 0.6, marginTop: 4 }}>Perfected. This one is as good as it gets.</div>
      )}
    </div>
  );
}

/**
 * TODAY'S SPECIAL (M8) — the board that turns over every real day.
 *
 * It sits at the TOP of the menu because it is the one thing here that is
 * different from yesterday, and it is the reason to open this modal on a day
 * when nothing else has changed. An unprepped special is never scolded: the
 * copy says what it would need, and leaves it there.
 */
function DailyCard({
  daily,
  stock,
  onPrep,
}: {
  daily: DailyState;
  stock: Record<string, number>;
  onPrep: () => void;
}) {
  const spec = DAILY_SPECIALS[daily.idx];
  if (!spec) return null;
  const short = Object.entries(spec.needs).filter(([id, n]) => (stock[id] ?? 0) < n);
  const ready = short.length === 0;
  return (
    <div
      style={{
        border: `1px solid ${daily.prepped ? "#e8a13d" : "rgba(74,54,38,0.8)"}`,
        borderRadius: 10,
        padding: "8px 10px",
        marginBottom: 8,
        background: daily.prepped ? "rgba(232,161,61,0.09)" : "rgba(20,14,11,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 800, color: "#e8a13d" }}>
          {spec.icon} Today: {spec.name}
        </span>
        {daily.prepped && <span style={{ opacity: 0.7 }}>served {daily.served}</span>}
      </div>
      {daily.prepped ? (
        <div style={{ opacity: 0.75, marginTop: 4, lineHeight: 1.4 }}>
          On the board. Every plate tonight tips a little better, and guests are easier to please.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 5 }}>
            <span style={{ opacity: 0.6 }}>Needs</span>
            {Object.entries(spec.needs).map(([id, n]) => {
              const have = stock[id] ?? 0;
              const ok = have >= n;
              const ing = ingredient(id);
              return (
                <span
                  key={id}
                  title={ing?.label ?? id}
                  style={{ color: ok ? "#e8a13d" : "#f3e9d2", opacity: ok ? 1 : 0.55 }}
                >
                  {ing?.icon ?? "•"} {have}/{n}
                </span>
              );
            })}
          </div>
          <button
            onClick={() => ready && onPrep()}
            disabled={!ready}
            style={{
              marginTop: 7,
              width: "100%",
              padding: "6px 11px",
              borderRadius: 999,
              border: `1px solid ${ready ? "#e8a13d" : "#4a3626"}`,
              background: ready ? "#e8a13d" : "#241a14",
              color: ready ? "#1b1310" : "#8a7a63",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 800,
              cursor: ready ? "pointer" : "default",
              boxShadow: ready ? "0 1px 6px rgba(232,161,61,0.28)" : "none",
            }}
          >
            {ready ? "Put it on the board" : "Waiting on the delivery"}
          </button>
        </>
      )}
      <div style={{ opacity: 0.5, marginTop: 6, lineHeight: 1.35 }}>
        A new special every day. Cooking it is a bonus, never a chore.
      </div>
    </div>
  );
}

export function MenuModal({
  menu,
  theme,
  pantry,
  daily,
  canUpgrade,
  onUpgrade,
  onPrepSpecial,
  onClose,
}: {
  menu: MenuState;
  theme: ThemeId;
  pantry: PantryState;
  daily: DailyState;
  canUpgrade: (key: string) => boolean;
  onUpgrade: (key: string) => void;
  onPrepSpecial: () => void;
  onClose: () => void;
}) {
  const names = THEME_MENUS[theme].names;
  const held = INGREDIENTS.filter((i) => (pantry.stock[i.id] ?? 0) > 0);
  return (
    <Modal title="TONIGHT'S MENU" onClose={onClose}>
      <DailyCard daily={daily} stock={pantry.stock} onPrep={onPrepSpecial} />
      <div
        style={{
          border: "1px solid rgba(74,54,38,0.8)",
          borderRadius: 10,
          padding: "7px 9px",
          marginBottom: 4,
          background: "rgba(20,14,11,0.5)",
        }}
      >
        <div style={{ opacity: 0.7, marginBottom: 4 }}>Pantry</div>
        {held.length === 0 ? (
          <div style={{ opacity: 0.55, lineHeight: 1.35 }}>
            Empty for now. A delivery comes every morning, and trading brings more in.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
            {held.map((i) => (
              <span key={i.id} style={{ fontWeight: 700 }} title={i.label}>
                {i.icon} <span style={{ opacity: 0.75, fontWeight: 400 }}>{i.label}</span>{" "}
                {pantry.stock[i.id]}
                {i.rarity === "rare" && <span style={{ color: "#e8a13d" }}>★</span>}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ opacity: 0.62, lineHeight: 1.4, margin: "7px 0 2px" }}>
        Better ingredients make better dishes, and better dishes lift your service.
        Ingredients arrive in the morning delivery and from trading.
      </div>
      {menu.dishes.map((d, i) => (
        <DishRow
          key={d.key}
          name={names[i] ?? d.name}
          dishKey={d.key}
          serves={d.serves}
          level={pantry.levels[d.key] ?? 1}
          stock={pantry.stock}
          canUpgrade={canUpgrade(d.key)}
          onUpgrade={onUpgrade}
        />
      ))}
      <div style={{ padding: "9px 0 4px", borderTop: "1px solid rgba(74,54,38,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 800, color: "#e8a13d" }}>
            {menu.specialMastered ? "★ " : ""}House Special
          </span>
          {menu.specialUnlocked ? (
            <span style={{ opacity: 0.65 }}>served {menu.specialServes}</span>
          ) : (
            <span style={{ opacity: 0.55 }}>🔒 locked</span>
          )}
        </div>
        {!menu.specialUnlocked && (
          <div style={{ opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
            Park or trade at your market and its signature dish joins your menu.
          </div>
        )}
        {menu.specialUnlocked && !menu.specialMastered && (
          <>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: "#31241b",
                border: "1px solid #4a3626",
                overflow: "hidden",
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.round((menu.specialServes / SPECIAL_MASTERY) * 100))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #d97b29, #e8a13d)",
                }}
              />
            </div>
            <div style={{ opacity: 0.7, marginTop: 4 }}>
              Serve it {SPECIAL_MASTERY - menu.specialServes} more times to master it.
            </div>
          </>
        )}
        {menu.specialMastered && (
          <div style={{ color: "#e8a13d", marginTop: 4, lineHeight: 1.4 }}>
            Mastered. This dish is yours forever, and the house apron comes with it.
          </div>
        )}
        {menu.specialUnlocked && (
          <DishRow
            name="Cooking level"
            dishKey="special"
            serves={menu.specialServes}
            level={pantry.levels["special"] ?? 1}
            stock={pantry.stock}
            canUpgrade={canUpgrade("special")}
            onUpgrade={onUpgrade}
            accent
          />
        )}
      </div>
      <div style={{ opacity: 0.55, marginTop: 8, lineHeight: 1.4 }}>
        Better ingredients make better dishes, and better dishes lift your service. Ingredients
        come from the morning delivery and from trading. They are never for sale.
      </div>
    </Modal>
  );
}

function momentLine(m: Moment): string {
  const h24 = Math.floor(m.hrs);
  const min = Math.floor((m.hrs - h24) * 60);
  const ap = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const when = `Day ${m.day + 1}, ${h12}:${min < 10 ? "0" : ""}${min}${ap}`;
  switch (m.kind) {
    case "gus":
      return `${when} · Gus came by his table. He always tips.`;
    case "special":
      return `${when} · The house special joined the menu.`;
    case "mastered":
      return `${when} · House special MASTERED. Yours forever.`;
    case "busy":
      return `${when} · A busy night. The line was long.`;
    case "dish":
      return `${when} · The kitchen learned to cook something better.`;
    case "course":
      return `${when} · Finished a course at the Academy.`;
    case "delivery": {
      const icons = m.emote
        .split(",")
        .map((id) => ingredient(id)?.icon ?? "")
        .join(" ");
      return `${when} · The delivery arrived. ${icons}`;
    }
    case "daily": {
      const spec = DAILY_SPECIALS.find((s) => s.id === m.emote);
      return `${when} · ${spec?.name ?? "The special"} went up on the board. ${spec?.icon ?? ""}`;
    }
    case "greet":
      return `${when} · You made the rounds. The room felt it.`;
    case "regular":
      return `${when} · ${m.emote} liked it here. They will be back.`;
    case "favourite":
      return `${when} · ${m.emote} got the dish they came for. ♥`;
    default:
      return m.emote === "heart"
        ? `${when} · A guest left with a full heart. ♥`
        : `${when} · A guest paid, tipped, and waved goodbye.`;
  }
}

export function BookModal({
  moments,
  hearts,
  served,
  gusVisits,
  regulars,
  dueToday,
  theme,
  onClose,
}: {
  moments: Moment[];
  hearts: number;
  served: number;
  gusVisits: number;
  regulars: Regular[];
  dueToday: number[];
  theme: ThemeId;
  onClose: () => void;
}) {
  const lines = [...moments].reverse();
  const due = new Set(dueToday);
  return (
    <Modal title="GUEST BOOK" onClose={onClose}>
      {/* A fresh save has nothing but zeros, and leading with a run-on
          "0 plates served, 0 hearts, Gus visits 0" makes an empty book look
          like a broken one. Story first; the tally becomes labelled tiles that
          read as a record rather than a scoreline. */}
      {lines.length === 0 && (
        <div style={{ opacity: 0.72, lineHeight: 1.45, marginBottom: 9 }}>
          The first page is still blank. Guests are on their way, and everything
          worth remembering gets written down here.
        </div>
      )}
      <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
        {[
          { k: "Plates served", v: served },
          { k: "Hearts", v: hearts },
          { k: "Gus visits", v: gusVisits },
        ].map((t) => (
          <div
            key={t.k}
            style={{
              flex: 1,
              borderRadius: 10,
              border: "1px solid rgba(74,54,38,0.8)",
              background: "rgba(20,14,11,0.5)",
              padding: "6px 8px",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: t.v > 0 ? "#e8a13d" : "#8a7a63" }}>
              {t.v}
            </div>
            <div style={{ opacity: 0.6, fontSize: 11 }}>{t.k}</div>
          </div>
        ))}
      </div>
      {/* WHO COMES HERE (M8b). The roster is earned with hearts, so it is a
          record of how the room has been run, and it is the one page worth
          opening on a day when nothing else has changed. Nobody ever lapses
          off this list, and a name not due today is not a name lost. */}
      {regulars.length > 0 && (
        <div
          style={{
            border: "1px solid rgba(74,54,38,0.8)",
            borderRadius: 10,
            padding: "7px 9px",
            marginBottom: 9,
            background: "rgba(20,14,11,0.5)",
          }}
        >
          <div style={{ opacity: 0.7, marginBottom: 5 }}>Regulars</div>
          {regulars.map((r, i) => (
            <div
              key={r.n}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "2px 0",
              }}
            >
              <span style={{ fontWeight: 700, color: due.has(i) ? "#e8a13d" : "#f3e9d2" }}>
                {REGULAR_NAMES[r.n]}
                {due.has(i) && <span style={{ opacity: 0.75 }}> · due in</span>}
              </span>
              <span style={{ opacity: 0.62, textAlign: "right" }}>
                loves {dishLabel(theme, r.fav)}
                {r.served > 0 && ` · served ${r.served}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {lines.map((m, i) => (
        <div
          key={i}
          style={{
            padding: "7px 0",
            borderTop: "1px solid rgba(74,54,38,0.6)",
            lineHeight: 1.4,
            opacity: 0.92,
          }}
        >
          {momentLine(m)}
        </div>
      ))}
    </Modal>
  );
}

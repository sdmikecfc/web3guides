"use client";

/**
 * M3b chrome (ADR-0101): the top-right chip bar (sound, menu, guest book)
 * and the two modals. DOM/React only. Player copy: 6th grade, kind, no
 * em-dashes, never "win $X". The menu modal is the ADR-0090 stub: the house
 * special is unlocked by participation, mastered by serving, cosmetic only.
 */

import type { MenuState, Moment, PantryState } from "./_engine/world";
import { SPECIAL_MASTERY } from "./_engine/world";
import { ingredient, INGREDIENTS, MAX_DISH_LEVEL, nextRecipe } from "./_engine/pantry";
import { itemDef } from "./_engine/items";
import { THEME_IDS, THEME_META, type ThemeId } from "./_view/preload";

const FONT = 'ui-rounded, "Segoe UI", system-ui, sans-serif';

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

const chip: React.CSSProperties = {
  background: "rgba(27,19,16,0.92)",
  border: "1px solid #4a3626",
  borderRadius: 999,
  color: "#f3e9d2",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 13px",
  cursor: "pointer",
};

export function ChipBar({
  muted,
  theme,
  editing,
  onMute,
  onMenu,
  onBook,
  onStyle,
  onEdit,
  onAcademy,
  graduate,
}: {
  muted: boolean;
  theme: ThemeId;
  editing: boolean;
  onMute: () => void;
  onMenu: () => void;
  onBook: () => void;
  onStyle: () => void;
  onEdit: () => void;
  onAcademy: () => void;
  graduate: boolean;
}) {
  return (
    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, zIndex: 6 }}>
      <button style={chip} onClick={onMute} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
        {muted ? "🔇" : "🔊"}
      </button>
      <button
        style={{
          ...chip,
          borderColor: editing ? "#e8a13d" : "#4a3626",
          background: editing ? "#2f2016" : "rgba(27,19,16,0.92)",
        }}
        onClick={onEdit}
        aria-label={editing ? "Finish arranging" : "Arrange the room"}
      >
        {editing ? "✓ Done" : "🔧 Arrange"}
      </button>
      <button style={chip} onClick={onStyle} aria-label="Change restaurant style">
        {THEME_META[theme].flag} Style
      </button>
      <button
        style={{ ...chip, borderColor: graduate ? "#e8a13d" : "#4a3626" }}
        onClick={onAcademy}
        aria-label="The Academy"
      >
        {graduate ? "🎓" : "📚"} Learn
      </button>
      <button style={chip} onClick={onMenu}>
        🍝 Menu
      </button>
      <button style={chip} onClick={onBook}>
        📖 Book
      </button>
      {/* the public spotlight (ADR-0111) */}
      <a
        href="/chef/board"
        style={{ ...chip, textDecoration: "none", display: "inline-block" }}
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
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(10,6,4,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 7,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(380px, 92vw)",
          maxHeight: "78vh",
          overflowY: "auto",
          background: "#241812",
          border: "1px solid #4a3626",
          borderRadius: 16,
          color: "#f3e9d2",
          fontFamily: FONT,
          fontSize: 13,
          padding: "14px 16px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 800, letterSpacing: "0.05em", fontSize: 15 }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ ...chip, padding: "4px 10px", fontSize: 13 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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
            <span style={{ fontSize: 22 }}>{meta.flag}</span>
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
    <span style={{ display: "inline-flex", gap: 9, flexWrap: "wrap" }}>
      {Object.entries(recipe).map(([id, need]) => {
        const have = stock[id] ?? 0;
        const ok = have >= need;
        return (
          <span key={id} style={{ color: ok ? "#e8a13d" : "#f3e9d2", opacity: ok ? 1 : 0.55 }}>
            {ingredient(id)?.icon ?? "•"} {have}/{need}
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
              background: canUpgrade ? "#2a1c14" : "#241a14",
              color: canUpgrade ? "#f3e9d2" : "#8a7a63",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 800,
              cursor: canUpgrade ? "pointer" : "default",
              whiteSpace: "nowrap",
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

export function MenuModal({
  menu,
  theme,
  pantry,
  canUpgrade,
  onUpgrade,
  onClose,
}: {
  menu: MenuState;
  theme: ThemeId;
  pantry: PantryState;
  canUpgrade: (key: string) => boolean;
  onUpgrade: (key: string) => void;
  onClose: () => void;
}) {
  const names = THEME_MENUS[theme].names;
  const held = INGREDIENTS.filter((i) => (pantry.stock[i.id] ?? 0) > 0);
  return (
    <Modal title="TONIGHT'S MENU" onClose={onClose}>
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
              <span key={i.id} style={{ fontWeight: 700 }}>
                {i.icon} {pantry.stock[i.id]}
                {i.rarity === "rare" && <span style={{ color: "#e8a13d" }}>★</span>}
              </span>
            ))}
          </div>
        )}
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
      return `${when} · The morning delivery arrived. ${icons}`;
    }
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
  onClose,
}: {
  moments: Moment[];
  hearts: number;
  served: number;
  gusVisits: number;
  onClose: () => void;
}) {
  const lines = [...moments].reverse();
  return (
    <Modal title="GUEST BOOK" onClose={onClose}>
      <div style={{ opacity: 0.7, marginBottom: 8 }}>
        {served} plates served · {hearts} hearts · Gus visits: {gusVisits}
      </div>
      {lines.length === 0 && (
        <div style={{ opacity: 0.6, lineHeight: 1.4 }}>
          The first page is still blank. Guests are on their way.
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

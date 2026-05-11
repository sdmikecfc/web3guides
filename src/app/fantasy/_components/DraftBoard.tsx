"use client";

import { useMemo, useState } from "react";
import {
  type FantasyToken,
  type Tier,
  TIER_META,
  fmtUsd,
  fmtInt,
  fmtPct,
} from "../_data/tokens";
import { TierBadge } from "./TierBadge";

const TIER_FILTERS: { value: Tier | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PREMIUM", label: "Premium" },
  { value: "UPPER_MID", label: "Upper-mid" },
  { value: "MID", label: "Mid" },
  { value: "SMALL", label: "Small" },
];

type SortKey = "fdv" | "holders" | "volume" | "change" | "domain";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "fdv", label: "FDV (cost)" },
  { value: "holders", label: "Holders" },
  { value: "volume", label: "Volume" },
  { value: "change", label: "24h change" },
  { value: "domain", label: "Domain" },
];

const TARGET_PICKS = 10;

export function DraftBoard({
  tokens,
  budgetUsd,
  initialPicks = [],
}: {
  tokens: FantasyToken[];
  budgetUsd: number;
  /** Pre-loaded picks from the DB, as token_address (CAIP-10) strings */
  initialPicks?: string[];
}) {
  // Map initialPicks (addresses) -> domain names for the existing UI state.
  const initialDomains = useMemo(() => {
    const byAddr = new Map(tokens.map((t) => [t.address.toLowerCase(), t.domain]));
    return initialPicks
      .map((a) => byAddr.get(String(a).toLowerCase()))
      .filter((d): d is string => Boolean(d));
  }, [tokens, initialPicks]);

  const [selected, setSelected] = useState<string[]>(initialDomains);  // domain names, in pick order
  const [tierFilter, setTierFilter] = useState<Tier | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("fdv");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const tokenByDomain = useMemo(() => {
    const m = new Map<string, FantasyToken>();
    for (const t of tokens) m.set(t.domain, t);
    return m;
  }, [tokens]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = tokens.filter((t) => {
      if (tierFilter !== "ALL" && t.tier !== tierFilter) return false;
      if (q && !t.domain.toLowerCase().includes(q)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sortBy) {
        case "fdv": return b.fdvUsd - a.fdvUsd;
        case "holders": return b.holderCount - a.holderCount;
        case "volume": return b.volumeUsd - a.volumeUsd;
        case "change":
          return (b.pctChange24h ?? -Infinity) - (a.pctChange24h ?? -Infinity);
        case "domain": return a.domain.localeCompare(b.domain);
      }
    });
    return out;
  }, [tokens, tierFilter, search, sortBy]);

  const pickedTokens = selected
    .map((d) => tokenByDomain.get(d))
    .filter((t): t is FantasyToken => Boolean(t));

  const totalCost = pickedTokens.reduce((s, t) => s + t.fdvUsd, 0);
  const remaining = budgetUsd - totalCost;
  const overBudget = remaining < 0;

  const togglePick = (domain: string) => {
    setSavedAt(null); setSaveError(null);
    setSelected((prev) => {
      if (prev.includes(domain)) return prev.filter((d) => d !== domain);
      if (prev.length >= TARGET_PICKS) return prev;
      return [...prev, domain];
    });
  };
  const removePick = (domain: string) => {
    setSavedAt(null); setSaveError(null);
    setSelected((prev) => prev.filter((d) => d !== domain));
  };

  const submitPicks = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const addresses = pickedTokens.map((t) => t.address);
      const resp = await fetch("/api/fantasy/draft/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: addresses }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body?.ok) {
        throw new Error(body?.error || `save failed (${resp.status})`);
      }
      setSavedAt(Date.now());
    } catch (err: any) {
      setSaveError(err?.message || "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
      {/* ─── LEFT: token list ───────────────────────────────── */}
      <div className="min-w-0">
        {/* Filter row */}
        <div className="glass rounded-xl p-3.5 mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {TIER_FILTERS.map((f) => {
              const active = tierFilter === f.value;
              const meta = f.value !== "ALL" ? TIER_META[f.value] : null;
              return (
                <button
                  key={f.value}
                  onClick={() => setTierFilter(f.value)}
                  className="font-mono text-[11px] uppercase tracking-[0.08em] rounded-full px-3 py-1.5 transition-all duration-150"
                  style={{
                    background: active
                      ? meta ? `${meta.tone}1F` : "rgba(124,106,255,0.18)"
                      : "rgba(255,255,255,0.025)",
                    border: `1px solid ${active ? (meta ? `${meta.tone}66` : "rgba(124,106,255,0.55)") : "rgba(255,255,255,0.08)"}`,
                    color: active ? (meta ? meta.tone : "#a89aff") : "var(--color-muted)",
                  }}
                >
                  {f.value !== "ALL" && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle"
                      style={{ background: meta!.dot }}
                    />
                  )}
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon />
              <input
                type="text"
                placeholder="Search domains…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface/60 border border-border/70 rounded-lg pl-9 pr-3 py-2 text-[13px] text-text placeholder-muted/70 focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="appearance-none bg-surface/60 border border-border/70 rounded-lg pl-3 pr-9 py-2 text-[13px] text-text focus:outline-none focus:border-accent/60 transition-colors cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-surface">
                    Sort: {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="glass rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[minmax(180px,2fr)_120px_120px_110px_120px_60px] gap-3 px-4 py-3 border-b border-border/60 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <div>Domain</div>
            <div className="text-right">FDV (cost)</div>
            <div className="text-right">Holders</div>
            <div className="text-right">24h</div>
            <div className="text-right">Volume</div>
            <div />
          </div>

          {/* Rows — virtualized? Not needed for 84 rows */}
          <div className="max-h-[640px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted text-sm">
                No domains match your filters.
              </div>
            ) : (
              filtered.map((t) => (
                <TokenRow
                  key={t.domain}
                  token={t}
                  isSelected={selected.includes(t.domain)}
                  canSelect={selected.length < TARGET_PICKS || selected.includes(t.domain)}
                  budgetRemaining={remaining}
                  onToggle={() => togglePick(t.domain)}
                />
              ))
            )}
          </div>
          <div className="px-4 py-2.5 border-t border-border/60 font-mono text-[10px] text-muted/80 flex items-center justify-between">
            <span>{filtered.length} of {tokens.length} eligible domains</span>
            <span>FDV column = current Doma market FDV (your draft cost)</span>
          </div>
        </div>
      </div>

      {/* ─── RIGHT: team panel ──────────────────────────────── */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <TeamPanel
          picked={pickedTokens}
          totalCost={totalCost}
          remaining={remaining}
          budgetUsd={budgetUsd}
          overBudget={overBudget}
          onRemove={removePick}
          onSubmit={submitPicks}
          saving={saving}
          saveError={saveError}
          savedAt={savedAt}
        />
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────
   Single token row in the list
   ───────────────────────────────────────── */

function TokenRow({
  token,
  isSelected,
  canSelect,
  budgetRemaining,
  onToggle,
}: {
  token: FantasyToken;
  isSelected: boolean;
  canSelect: boolean;
  budgetRemaining: number;
  onToggle: () => void;
}) {
  const tooExpensive = !isSelected && token.fdvUsd > budgetRemaining;
  const disabled = !canSelect && !isSelected;

  const meta = TIER_META[token.tier];

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="group w-full text-left grid grid-cols-[minmax(180px,2fr)_120px_120px_110px_120px_60px] gap-3 px-4 py-3 border-b border-border/30 transition-colors hover:bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: isSelected
          ? `linear-gradient(90deg, ${meta.tone}14 0%, transparent 60%)`
          : undefined,
        borderLeft: isSelected ? `3px solid ${meta.tone}` : "3px solid transparent",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <TierBadge tier={token.tier} size="dot" />
        <div className="min-w-0">
          <div className="font-display text-[14px] font-semibold text-text truncate">
            {token.domain}
          </div>
          <div className="font-mono text-[10px] text-muted/80 truncate">
            {meta.label.toLowerCase()}
            {token.status === "FRACTIONALIZED" && <span className="ml-2">· bonding</span>}
          </div>
        </div>
      </div>

      <div className="text-right font-mono text-[13px] tabular-nums text-text">
        {fmtUsd(token.fdvUsd, { compact: true })}
        {tooExpensive && (
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-rose-400/80 mt-0.5">
            over budget
          </div>
        )}
      </div>

      <div className="text-right font-mono text-[13px] tabular-nums text-muted">
        {fmtInt(token.holderCount)}
      </div>

      <div className="text-right font-mono text-[13px] tabular-nums">
        {token.pctChange24h === null ? (
          <span className="text-muted/60">—</span>
        ) : (
          <span
            style={{
              color:
                token.pctChange24h > 0 ? "#34d399" :
                token.pctChange24h < 0 ? "#f87171" : "var(--color-muted)",
            }}
          >
            {fmtPct(token.pctChange24h, { showSign: true })}
          </span>
        )}
      </div>

      <div className="text-right font-mono text-[13px] tabular-nums text-muted">
        {fmtUsd(token.volumeUsd, { compact: true })}
      </div>

      <div className="flex justify-end items-center">
        <span
          className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
          style={{
            background: isSelected ? `${meta.tone}28` : "rgba(255,255,255,0.04)",
            border: `1px solid ${isSelected ? `${meta.tone}66` : "rgba(255,255,255,0.08)"}`,
            color: isSelected ? meta.tone : "var(--color-muted)",
          }}
        >
          {isSelected ? <CheckIcon /> : <PlusIcon />}
        </span>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────
   Right-side team panel
   ───────────────────────────────────────── */

function TeamPanel({
  picked,
  totalCost,
  remaining,
  budgetUsd,
  overBudget,
  onRemove,
  onSubmit,
  saving,
  saveError,
  savedAt,
}: {
  picked: FantasyToken[];
  totalCost: number;
  remaining: number;
  budgetUsd: number;
  overBudget: boolean;
  onRemove: (domain: string) => void;
  onSubmit: () => void | Promise<void>;
  saving: boolean;
  saveError: string | null;
  savedAt: number | null;
}) {
  const filledCount = picked.length;
  const fillPct = Math.min(100, Math.max(0, (totalCost / budgetUsd) * 100));
  const slots: (FantasyToken | null)[] = [
    ...picked,
    ...Array(TARGET_PICKS - picked.length).fill(null),
  ];

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Your Team
          </div>
          <div className="font-display text-[15px] font-semibold tabular-nums">
            {filledCount}<span className="text-muted">/{TARGET_PICKS}</span> picks
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Budget left
          </div>
          <div
            className="font-mono text-[15px] font-semibold tabular-nums"
            style={{ color: overBudget ? "#f87171" : "var(--color-text)" }}
          >
            {fmtUsd(remaining, { compact: true })}
          </div>
        </div>
      </div>

      {/* Slot list */}
      <div className="px-3 py-3 space-y-1.5">
        {slots.map((t, i) =>
          t ? (
            <FilledSlot key={t.domain} token={t} index={i} onRemove={() => onRemove(t.domain)} />
          ) : (
            <EmptySlot key={`slot-${i}`} index={i} />
          )
        )}
      </div>

      {/* Budget bar */}
      <div className="px-5 pb-3 pt-2">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted mb-1.5">
          <span>Spent</span>
          <span className="tabular-nums">
            {fmtUsd(totalCost, { compact: true })} <span className="text-muted/50">/</span> {fmtUsd(budgetUsd, { compact: true })}
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden relative"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${fillPct}%`,
              background: overBudget
                ? "linear-gradient(90deg, #f87171, #fb7185)"
                : "linear-gradient(90deg, #7c6aff, #a78bfa)",
              boxShadow: overBudget
                ? "0 0 12px rgba(248,113,113,0.5)"
                : "0 0 12px rgba(124,106,255,0.4)",
            }}
          />
        </div>
      </div>

      {/* Action */}
      <div className="px-3 pb-3 space-y-2">
        <button
          type="button"
          disabled={filledCount !== TARGET_PICKS || overBudget || saving}
          className="w-full rounded-xl py-3 font-display font-semibold text-[14px] tracking-tight transition-all duration-200 disabled:cursor-not-allowed"
          style={
            filledCount === TARGET_PICKS && !overBudget && !saving
              ? {
                  background: "linear-gradient(135deg, #7c6aff, #4f3cc9)",
                  color: "#fff",
                  boxShadow: "0 8px 24px rgba(124,106,255,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                }
              : {
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--color-muted)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }
          }
          onClick={() => {
            if (filledCount === TARGET_PICKS && !overBudget && !saving) {
              void onSubmit();
            }
          }}
        >
          {saving
            ? "Saving…"
            : overBudget
              ? `Over budget by ${fmtUsd(-remaining, { compact: true })}`
              : filledCount < TARGET_PICKS
                ? `Pick ${TARGET_PICKS - filledCount} more`
                : "Lock in 10 picks"}
        </button>

        {saveError && (
          <div
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#fca5a5" }}
          >
            {saveError}
          </div>
        )}
        {savedAt && !saveError && (
          <div
            className="rounded-lg px-3 py-2 text-[12px] flex items-center gap-2"
            style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#86efac" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Team saved — you can keep editing until the draft locks.
          </div>
        )}
      </div>
    </div>
  );
}

function FilledSlot({
  token,
  index,
  onRemove,
}: {
  token: FantasyToken;
  index: number;
  onRemove: () => void;
}) {
  const meta = TIER_META[token.tier];
  return (
    <div
      className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors"
      style={{
        background: `linear-gradient(90deg, ${meta.tone}10 0%, rgba(255,255,255,0.01) 80%)`,
        border: `1px solid ${meta.tone}24`,
      }}
    >
      <div className="font-mono text-[10px] text-muted/70 w-5 text-right tabular-nums">
        {String(index + 1).padStart(2, "0")}
      </div>
      <TierBadge tier={token.tier} size="dot" />
      <div className="flex-1 min-w-0">
        <div className="font-display text-[13px] font-semibold text-text truncate leading-tight">
          {token.domain}
        </div>
        <div className="font-mono text-[10px] text-muted">
          {meta.label.toLowerCase()}
        </div>
      </div>
      <div className="font-mono text-[12px] tabular-nums text-text">
        {fmtUsd(token.fdvUsd, { compact: true })}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center justify-center h-6 w-6 rounded-md text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
        aria-label={`Remove ${token.domain}`}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function EmptySlot({ index }: { index: number }) {
  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-dashed"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        background: "transparent",
      }}
    >
      <div className="font-mono text-[10px] text-muted/40 w-5 text-right tabular-nums">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="h-1.5 w-1.5 rounded-full bg-white/10" />
      <div className="flex-1 font-display text-[13px] text-muted/40">empty slot</div>
      <div className="font-mono text-[12px] text-muted/30">—</div>
    </div>
  );
}

/* ─── icons ─────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" className="text-muted/70" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted/70" />
    </svg>
  );
}
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted" />
    </svg>
  );
}

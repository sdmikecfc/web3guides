"use client";
/**
 * THE WAR EFFORT, the commit action on the stronghold panel (/s5/map).
 *
 * One control per stronghold row. It shows what is already riding on that wall
 * and, for an enlisted commander, opens an inline declare form.
 *
 * MONEY HONESTY: Shells are the play currency. Nothing here shows a dollar
 * figure or implies one, and the copy states the downside (a wall that stands
 * keeps the Shells) in the same breath as the upside. The SERVER is the
 * authority on every rule: this component's `open` flag only greys a button,
 * and /api/s5/war-effort/commit re-checks the window, the bounds and the
 * balance before a single Shell moves.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { readSessionToken } from "@/lib/s5/games";
import { fill, type S5Dict } from "@/lib/s5/strings";

const TEXT = "#e9edf1";
const MUTED = "#aab4bd";
const FAINT = "#87919b";
const EMBER = "#e0662e";
const BORDER = "#232a32";
const GOOD = "#4fa96a";

export type WarEffortRowView = {
  domain: string;
  name: string;
  status: string;
  open: boolean;
  committed: number;
  commanders: number;
};

const num = (n: number) => Math.round(n).toLocaleString("en-US");

/** Reason a closed window is closed, in the player's language. */
function closedReason(d: S5Dict["warEffort"], status: string, open: boolean): string {
  if (status === "bonded") return d.closedBonded;
  if (status === "failed") return d.closedFailed;
  if (status !== "live") return d.closedNotLive;
  return open ? "" : d.closedSprint;
}

export function WarEffortControl({
  row,
  dict,
  min,
  max,
  mult,
}: {
  row: WarEffortRowView;
  dict: S5Dict;
  min: number;
  max: number;
  mult: number;
}) {
  const d = dict.warEffort;
  const [token, setToken] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [amount, setAmount] = useState<string>(String(min));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  const [committed, setCommitted] = useState(row.committed);
  const [commanders, setCommanders] = useState(row.commanders);

  useEffect(() => {
    setToken(readSessionToken() || null);
  }, []);

  // The caller's own commitment on THIS wall (so the button can say so).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch("/api/s5/war-effort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { mine?: { domain: string; shells: number }[] } | null) => {
        if (cancelled || !j?.mine) return;
        const own = j.mine.find((c) => c.domain === row.domain);
        if (own) setMine(own.shells);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, row.domain]);

  const submit = useCallback(async () => {
    const shells = Math.floor(Number(amount) || 0);
    if (!(shells >= min && shells <= max)) {
      setMsg(fill(d.range, { min: num(min), max: num(max) }));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/s5/war-effort/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, domain: row.domain, shells }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; shells?: number } | null;
      if (j?.ok) {
        setMine(Number(j.shells) || shells);
        setCommitted((c) => c + (Number(j.shells) || shells));
        setCommanders((c) => c + 1);
        setOpenForm(false);
        setMsg(fill(d.placed, { n: num(Number(j.shells) || shells), name: row.name }));
      } else {
        setMsg(j?.error || d.error);
      }
    } catch {
      setMsg(d.error);
    } finally {
      setBusy(false);
    }
  }, [amount, min, max, token, row.domain, row.name, d]);

  const reason = closedReason(d, row.status, row.open);
  const canDeclare = row.open && token !== null && mine === null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        marginTop: 10,
        paddingTop: 10,
        borderTop: `1px solid ${BORDER}`,
        fontSize: 12.5,
      }}
    >
      <span style={{ color: FAINT, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 10.5, fontWeight: 700 }}>
        {d.colCommitted}
      </span>
      <span style={{ color: committed > 0 ? TEXT : FAINT, fontVariantNumeric: "tabular-nums" }}>
        {committed > 0 ? `${fill(d.committed, { n: num(committed) })} · ${fill(d.commanders, { n: num(commanders) })}` : d.none}
      </span>

      {mine !== null ? (
        <span style={{ color: GOOD, fontWeight: 700 }}>
          {fill(d.committed, { n: num(mine) })} · {d.statusCommitted}
        </span>
      ) : !token ? (
        <Link href="/s5/join" style={{ color: MUTED, textDecoration: "underline" }}>
          {d.guest}
        </Link>
      ) : canDeclare ? (
        <button
          type="button"
          onClick={() => setOpenForm((v) => !v)}
          style={{
            background: openForm ? "transparent" : EMBER,
            color: openForm ? MUTED : "#12161b",
            border: `1px solid ${openForm ? BORDER : EMBER}`,
            borderRadius: 6,
            padding: "5px 12px",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {openForm ? d.cancel : d.cta}
        </button>
      ) : (
        <span style={{ color: FAINT }} title={reason}>
          {d.closed}
        </span>
      )}

      {openForm && canDeclare ? (
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, width: "100%", marginTop: 6 }}>
          <label style={{ color: MUTED }} htmlFor={`we-${row.domain}`}>
            {d.amountLabel}
          </label>
          <input
            id={`we-${row.domain}`}
            type="number"
            min={min}
            max={max}
            step={10}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: 110,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              color: TEXT,
              padding: "5px 8px",
              fontVariantNumeric: "tabular-nums",
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              background: EMBER,
              color: "#12161b",
              border: "none",
              borderRadius: 6,
              padding: "5px 12px",
              fontWeight: 800,
              fontSize: 12,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? d.working : fill(d.confirm, { n: num(Math.floor(Number(amount) || 0)) })}
          </button>
          <span style={{ color: FAINT, width: "100%", lineHeight: 1.6 }}>
            {fill(d.returns, { n: num(Math.floor(Number(amount) || 0) * mult) })} {d.note}
          </span>
        </span>
      ) : null}

      {msg ? (
        <span role="status" style={{ color: MUTED, width: "100%", lineHeight: 1.6 }}>
          {msg}
        </span>
      ) : null}
    </div>
  );
}

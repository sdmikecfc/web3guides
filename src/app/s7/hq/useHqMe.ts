"use client";
/**
 * THE PLAYER'S OWN STATE, for any surface that needs it.
 *
 * Extracted so the world map can open the tank, commander and workbench panels
 * as CARDS OVER THE MAP instead of routing to the HQ. Those panels already
 * take `{ me, patchMe }` and nothing else, so once this hook supplies the pair
 * they drop straight into a popup with no rewrite — which is the whole reason
 * "upgrade your tank without leaving the map" is a small change rather than a
 * second implementation of the garage.
 *
 * The play-session token lives in localStorage and is therefore invisible to
 * the server, which is why this has to be a client-side fetch and why every
 * server page renders the guest defaults first. Guests keep the defaults and
 * every panel still opens; they just cannot save.
 */
import { useCallback, useEffect, useState } from "react";
import { clampStats, readSessionToken } from "@/lib/s7/games";
import { resolveAdventurerKey, type ResolvedTank } from "@/lib/s7/model";
import { defaultHqMe, type HqMe } from "./panels";
import { demoHqMe, isDemo } from "@/lib/s7/demo";

type MeResponse = {
  ok?: boolean;
  tank?: ResolvedTank;
  player?: { displayName?: string | null; points?: number; playCurrency?: number; handle?: string | null };
  heldUsd?: number;
  rawStats?: unknown;
  hq?: {
    adventurer?: string;
    ownedTanks?: string[];
    ownedCamos?: string[];
    ownedAdventurers?: string[];
    bondsTier?: number;
    streakDays?: number;
    crates?: string[];
  };
  /** Per-stronghold Shells commitments. The only per-domain participation
   * signal /api/s7/me currently returns; holdings are a season total only. */
  warEffort?: Array<{ domain?: string; shells?: number }>;
};

export type HqMeState = {
  me: HqMe;
  patchMe: (patch: Partial<HqMe>) => void;
  /** Domains this commander has committed Shells to, lowercased. */
  committed: Set<string>;
  /** True once the session lookup has settled, so a card can avoid flashing
   * "not signed in" at somebody who is. */
  ready: boolean;
};

export function useHqMe(): HqMeState {
  const [me, setMe] = useState<HqMe>(() => defaultHqMe());
  const [committed, setCommitted] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  const patchMe = useCallback((patch: Partial<HqMe>) => {
    setMe((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    // DEMO SANDBOX: seed a funded commander and never call the network. This is
    // the only way to watch the shop loop without a bot-swept wallet, which is
    // why Mike had never seen it work.
    if (isDemo()) {
      setMe(demoHqMe());
      setReady(true);
      return;
    }
    let cancelled = false;
    const token = readSessionToken();
    if (!token) {
      setReady(true);
      return;
    }
    void fetch("/api/s7/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .then((resp) => {
        if (cancelled) return;
        setReady(true);
        if (!resp?.ok) return;
        if (Array.isArray(resp.warEffort)) {
          setCommitted(
            new Set(
              resp.warEffort
                .map((w) => String(w?.domain || "").toLowerCase())
                .filter(Boolean),
            ),
          );
        }
        setMe((prev) => ({
          ...prev,
          session: true,
          token,
          handle: typeof resp.player?.handle === "string" && resp.player.handle ? resp.player.handle : prev.handle,
          shells: Math.max(0, Math.round(Number(resp.player?.playCurrency) || 0)),
          points: Math.max(0, Math.round(Number(resp.player?.points) || 0)),
          heldUsd: Math.max(0, Number(resp.heldUsd) || 0),
          tank: resp.tank || prev.tank,
          ownedTanks:
            Array.isArray(resp.hq?.ownedTanks) && resp.hq.ownedTanks.length > 0
              ? resp.hq.ownedTanks
              : prev.ownedTanks,
          // same half-finished rename as HqScene: the field is `adventurer` and the
          // resolver reads `src.adventurer` (fixed 2026-08-15)
          adventurer: resolveAdventurerKey({ adventurer: resp.hq?.adventurer }),
          ownedCamos: Array.isArray(resp.hq?.ownedCamos)
            ? resp.hq.ownedCamos.filter((c): c is string => typeof c === "string")
            : prev.ownedCamos,
          ownedAdventurers: Array.isArray(resp.hq?.ownedAdventurers)
            ? resp.hq.ownedAdventurers.filter((c): c is string => typeof c === "string")
            : prev.ownedAdventurers,
          stats: clampStats(resp.rawStats),
          bondsTier: Math.max(0, Math.min(20, Math.round(Number(resp.hq?.bondsTier) || 0))),
          streakDays: Math.max(0, Math.round(Number(resp.hq?.streakDays) || 0)),
          crates: Array.isArray(resp.hq?.crates)
            ? resp.hq.crates.filter((c): c is string => typeof c === "string")
            : prev.crates,
        }));
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { me, patchMe, committed, ready };
}

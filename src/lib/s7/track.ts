/**
 * S7 funnel tracking, client-safe beacon helper.
 *
 * Fire-and-forget: posts { session_id, event, ref, utm, path } to
 * /api/s7/events via navigator.sendBeacon (fetch keepalive fallback). The
 * anonymous session id is a uuid persisted in localStorage "s7_sid"; no wallet
 * is ever sent from here (the events route only ever trusts a wallet it
 * resolved itself from a play-session token).
 *
 * landing_view is deduped per session per day via localStorage, so refreshes
 * do not inflate the top of the funnel. Everything is wrapped: tracking must
 * never break the page.
 */

const SID_KEY = "s7_sid";
const LANDING_DAY_KEY = "s7_lv_day";
const REF_KEY = "s7_ref"; // first-touch referral code, read at join (ADR-0068 §3)
const INVITE_DAY_KEY = "s7_ic_day"; // invite_clicked dedupe, mirrors landing_view

function sessionId(): string | null {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid || !/^[A-Za-z0-9-]{8,64}$/.test(sid)) {
      sid =
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

function utmFromLocation(): Record<string, string> {
  const utm: Record<string, string> = {};
  try {
    const p = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = p.get(k);
      if (v) utm[k.slice(4)] = v.slice(0, 80);
    }
  } catch {
    // no window / bad URL: empty utm
  }
  return utm;
}

function refFromLocation(): string | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("ref");
    if (r && /^[A-Za-z0-9_-]{1,32}$/.test(r)) return r;
    const dr = document.referrer;
    return dr ? dr.slice(0, 200) : null;
  } catch {
    return null;
  }
}

// Persist the FIRST player referral code this browser arrives with, so a
// visitor who lands on ?ref=K7M2QF, browses, and enlists three pages later
// still attributes. First touch wins for the season; ad tags (doma-*) and
// referrer URLs are never stored — only code-shaped refs. Brothers in Arms,
// ADR-0068 §3.
export function rememberRef(): void {
  try {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("ref");
    if (!r || !/^[A-Za-z0-9]{4,12}$/.test(r) || r.toLowerCase().startsWith("doma")) return;
    if (!localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, r.toUpperCase());
    // invite_clicked: once per day per session, the top of the invite chain.
    const day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(INVITE_DAY_KEY) !== day) {
      localStorage.setItem(INVITE_DAY_KEY, day);
      track("invite_clicked");
    }
  } catch {
    // storage blocked: attribution is best-effort, never breaks the page
  }
}

/** The stored first-touch referral code, if any (read by the join form). */
export function storedRef(): string | null {
  try {
    const r = localStorage.getItem(REF_KEY);
    return r && /^[A-Z0-9]{4,12}$/.test(r) ? r : null;
  } catch {
    return null;
  }
}

/** Send one funnel event. Safe to call anywhere client-side; no-ops on SSR. */
export function track(event: string, extra?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    const sid = sessionId();
    if (!sid) return;

    // Dedupe the landing view: once per session per UTC day.
    if (event === "landing_view") {
      const day = new Date().toISOString().slice(0, 10);
      try {
        if (localStorage.getItem(LANDING_DAY_KEY) === day) return;
        localStorage.setItem(LANDING_DAY_KEY, day);
      } catch {
        // storage blocked: still send (worst case a dupe, never a crash)
      }
    }

    const payload = JSON.stringify({
      session_id: sid,
      event,
      ref: refFromLocation(),
      utm: utmFromLocation(),
      path: window.location.pathname,
      ...(extra || {}),
    });

    const url = "/api/s7/events";
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // tracking never breaks the page
  }
}

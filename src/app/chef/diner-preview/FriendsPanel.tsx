"use client";
import { useCallback, useEffect, useState } from "react";
import { INGREDIENTS, INGREDIENT_BY_ID } from "@/lib/chef/diner/content";
import { DINER_SOCIAL_RULES, DINER_STICKERS, type DinerSocialCommand } from "@/lib/chef/diner/social";
import type { DinerState } from "@/lib/chef/diner/progression";
import type { SyncStatus } from "./diner-sync";
import css from "./diner.module.css";
import styles from "./FriendsPanel.module.css";

export interface DinerAccountSession { accessToken: string; refreshToken: string; expiresAt: number; playerId: string }
export interface FriendsPanelProps {
  state: DinerState; syncStatus: SyncStatus; serverEnabled: boolean;
  connect: () => void | Promise<unknown>;
  read: (path: string, body?: unknown) => Promise<unknown>;
  social: (command: DinerSocialCommand) => Promise<unknown>;
  acceptSession?: (session: DinerAccountSession) => Promise<unknown>;
  onVisit?: (handle: string) => void;
}
interface SocialView {
  profile: { handle: string; published: boolean; tradesToday: number; tradeDay: number };
  friends: { handle: string; name: string; status: "friend" | "sent" | "received" | "blocked"; published: boolean }[];
  discover: { handle: string; name: string }[];
  trades: { id: string; fromHandle: string; toHandle: string; give: string; receive: string; status: string; expiresAt: number }[];
  stickers: { id: string; name: string; count: number }[];
}
const ingredientName = (id: string) => INGREDIENT_BY_ID[id]?.name ?? id.replaceAll("_", " ");
const dataOf = (value: unknown) => value as Record<string, unknown>;
export default function FriendsPanel({ state, syncStatus, serverEnabled, connect, read, social, acceptSession, onVisit }: FriendsPanelProps) {
  const [view, setView] = useState<SocialView | null>(null), [tab, setTab] = useState<"street" | "trades" | "account">("street");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [handle, setHandle] = useState(""), [target, setTarget] = useState(""), [give, setGive] = useState("beef"), [receive, setReceive] = useState("tomato");
  const [email, setEmail] = useState(""), [token, setToken] = useState(""), [sent, setSent] = useState(false), [recover, setRecover] = useState(false), [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const connected = syncStatus !== "guest" && syncStatus !== "connecting";
  const ready = connected && syncStatus !== "offline" && serverEnabled;
  const load = useCallback(async () => { const result = dataOf(await read("social")); if (result.ok === false) throw new Error(String(result.error ?? "The street could not be loaded.")); setView(result as unknown as SocialView); }, [read]);
  useEffect(() => { if (!ready) return; let active = true; void read("social").then(value => { const result = dataOf(value); if (active && result.ok !== false) setView(result as unknown as SocialView); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "The street could not be loaded."); }); return () => { active = false; }; }, [ready, read]);
  useEffect(() => { if (!ready || tab !== "account") return; let active = true; void read("account").then(value => { const account = dataOf(value); if (active && account.verified && typeof account.email === "string") setVerifiedEmail(account.email); }).catch(() => {}); return () => { active = false; }; }, [ready, tab, read]);
  async function act(command: DinerSocialCommand, message: string) {
    if (busy || !ready) return; setBusy(true); setError(""); setNotice("");
    try { const result = await social(command); if (result === false || (result && typeof result === "object" && dataOf(result).ok === false)) throw new Error("This action did not save. Review your diner and retry."); await load(); setNotice(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This action could not be saved."); }
    finally { setBusy(false); }
  }
  async function accountAction() {
    if (busy || !serverEnabled) return; setBusy(true); setError(""); setNotice("");
    try {
      const account = dataOf(await read(recover ? "account/recover" : "account", { email: email.trim(), ...(sent ? { token } : {}) }));
      if (account.ok === false) throw new Error(String(account.error ?? "Please try again."));
      if (typeof account.accessToken === "string" && typeof account.refreshToken === "string" && typeof account.playerId === "string" && typeof account.expiresAt === "number") {
        if (!acceptSession) throw new Error("The verified session is ready, but this preview needs its account connection updated.");
        await acceptSession(account as unknown as DinerAccountSession); setVerifiedEmail(email.trim()); setSent(false); setToken(""); setNotice("Your verified diner account is connected.");
      } else if (account.verified) { setVerifiedEmail(email.trim()); setSent(false); setToken(""); setNotice("Your email is verified."); }
      else { setSent(true); setNotice(recover ? "If that email has a diner account, a sign-in code is on its way." : "Check your email for a verification code. Your account stays here while you confirm it."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The account service is unavailable."); }
    finally { setBusy(false); }
  }
  const visit = (friendHandle: string, name: string) => onVisit ? <button className={css.button} onClick={() => onVisit(friendHandle)}>Visit {name}</button> : <a className={`${css.button} ${styles.link}`} href={`/chef/diner-preview/visit/${friendHandle}`} target="_blank" rel="noopener noreferrer">Visit</a>;
  if (!serverEnabled) return <div className={css.empty}><h3>Your street is taking shape.</h3><p>Friends, visits and ingredient trades will open when online preview saves are configured. Your browser diner is ready to keep playing.</p><p className={css.small}>No account or wallet is needed for the local preview.</p></div>;
  return <div>
    <p className={css.panelLead}>A little street of diners, each with someone&apos;s own story.</p>
    <div className={css.tabs} role="tablist" aria-label="Your street">{([['street','Neighbours'],['trades','Ingredient trades'],['account','Your account']] as const).map(([id,label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? css.tabActive : ""} onClick={() => setTab(id)}>{label}</button>)}</div>
    {error && <p className={css.error} role="alert">{error}</p>}{notice && <p className={css.notice} role="status">{notice}</p>}
    {!connected && <div className={css.notice}><p>Connect a fresh online diner to join the street. Your separate browser room stays saved.</p><div className={styles.actions}><button className={css.primary} disabled={busy || syncStatus === 'connecting'} onClick={() => void connect()}>Start an online diner</button><button className={css.softButton} onClick={() => { setRecover(true); setSent(false); setTab("account"); }}>Reopen an email account</button></div></div>}
    {syncStatus === "offline" && <p className={css.notice}>Your connection is paused. Reconnect before sending invitations or accepting trades.</p>}
    {tab === "street" && view && <>
      <div className={css.statBox}><span className={css.eyebrow}>Your address</span><p className={styles.handle}>{view.profile.handle}</p><p className={css.small}>{view.profile.published ? "Your room is visible to other diners." : "Your room is private until you publish it."}</p><button className={view.profile.published ? css.button : css.primary} disabled={busy || !ready} onClick={() => void act({ type: "publish", enabled: !view.profile.published }, view.profile.published ? "Your diner is private again." : "Your diner is open to visitors.")}>{view.profile.published ? "Unpublish room" : "Publish my room"}</button></div>
      <form onSubmit={event => { event.preventDefault(); void act({ type: "request", targetHandle: handle.trim().toLowerCase() }, "Invitation sent."); }}><label className={css.field}>Invite a diner<span className={css.inputRow}><input value={handle} onChange={event => setHandle(event.target.value)} placeholder="diner-…" autoCapitalize="none" spellCheck={false} maxLength={22}/><button className={css.button} disabled={busy || !ready || !view.profile.published || !/^diner-[a-f0-9]{16}$/i.test(handle.trim())}>Invite</button></span></label></form>
      <h3 className={css.sectionTitle}>Your neighbours</h3>
      {!view.friends.length && <p className={css.small}>Your first invitation is the beginning of the street.</p>}
      <div className={css.list}>{view.friends.map(friend => <article className={css.card} key={friend.handle}><div className={css.cardBody}><h3>{friend.name}</h3><p>{friend.status === "received" ? "Would love to be your neighbour." : friend.status === "sent" ? "Invitation waiting for a reply." : friend.status === "blocked" ? "Interactions blocked." : friend.handle}</p><div className={styles.actions}>
        {friend.published && friend.status !== "blocked" && visit(friend.handle, friend.name)}
        {friend.status === "received" && <button className={css.primary} disabled={busy || !ready} onClick={() => void act({ type: "accept", targetHandle: friend.handle }, "You are neighbours now.")}>Accept invitation</button>}
        {friend.status === "friend" && <button className={css.button} disabled={busy || !ready || state.daily.kindness} onClick={() => void act({ type: "visitGift", targetHandle: friend.handle }, "A friendship ingredient is in your pantry.")}>{state.daily.kindness ? "Daily kindness collected" : "Find today’s parcel"}</button>}
        {friend.status === "friend" && <select className={css.textInput} aria-label={`Leave a sticker for ${friend.name}`} value="" disabled={busy || !ready} onChange={event => { if (event.target.value) void act({ type: "sticker", targetHandle: friend.handle, stickerId: event.target.value }, "A little sticker, left with love."); }}><option value="">Leave a sticker</option>{DINER_STICKERS.map(sticker => <option key={sticker.id} value={sticker.id}>{sticker.name}</option>)}</select>}
        {friend.status !== "blocked" && <button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "remove", targetHandle: friend.handle }, "Invitation or friendship removed.")}>Remove</button>}
        {friend.status !== "blocked" && <button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "block", targetHandle: friend.handle }, "Interactions with this diner are blocked.")}>Block</button>}
        {friend.status === "blocked" && <button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "unblock", targetHandle: friend.handle }, "Your block was removed. Send a new invitation to become neighbours again.")}>Unblock</button>}
      </div></div></article>)}</div>
      <h3 className={css.sectionTitle}>Around the corner</h3><div className={`${css.grid} ${css.gridTwo}`}>{view.discover.filter(diner => !view.friends.some(friend => friend.handle === diner.handle)).map(diner => <article className={css.card} key={diner.handle}><div className={css.cardBody}><h3>{diner.name}</h3><p>{diner.handle}</p><div className={styles.actions}>{visit(diner.handle,diner.name)}<button className={css.button} disabled={busy || !ready || !view.profile.published} onClick={() => void act({ type: "request", targetHandle: diner.handle }, "Invitation sent.")}>Invite</button></div></div></article>)}</div>
      {!view.discover.length && <p className={css.small}>No published diners to discover yet. Invite someone with their diner address.</p>}
      <p className={css.notice}>One friendship parcel or regular&apos;s gift each day, shared across the whole street.</p>
    </>}
    {tab === "trades" && view && <>
      <p className={css.panelLead}>One ingredient for one ingredient. Both neighbours need level 8, with five completed trades per day each.</p>
      <p className={css.badge}>{view.profile.tradeDay === state.daily.day ? view.profile.tradesToday : 0} / {DINER_SOCIAL_RULES.tradesPerDay} trades today</p>
      <form onSubmit={event => { event.preventDefault(); void act({ type: "offerTrade", targetHandle: target, give, receive }, "Your offered ingredient is reserved until they accept or either of you cancels."); }} className={styles.tradeForm}>
        <label className={css.field}>Neighbour<select value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose a neighbour</option>{view.friends.filter(friend => friend.status === "friend" && friend.published).map(friend => <option key={friend.handle} value={friend.handle}>{friend.name}</option>)}</select></label>
        <label className={css.field}>Give one<select value={give} onChange={event => setGive(event.target.value)}>{INGREDIENTS.map(ingredient => <option key={ingredient.id} value={ingredient.id} disabled={(state.pantry[ingredient.id] ?? 0) < 1}>{ingredient.name} · {state.pantry[ingredient.id] ?? 0} owned</option>)}</select></label>
        <label className={css.field}>Ask for one<select value={receive} onChange={event => setReceive(event.target.value)}>{INGREDIENTS.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></label>
        <button className={css.primary} disabled={busy || !ready || state.restaurantLevel < 8 || !target || give === receive || (state.pantry[give] ?? 0) < 1}>Reserve & offer</button>
      </form>
      <h3 className={css.sectionTitle}>Pending offers</h3><div className={css.list}>{view.trades.map(trade => { const incoming = trade.toHandle === view.profile.handle, expired = Date.now() >= trade.expiresAt; return <article className={css.row} key={trade.id}><div><h3>{ingredientName(trade.give)} for {ingredientName(trade.receive)}</h3><p>{incoming ? `From ${trade.fromHandle}` : `Sent to ${trade.toHandle}`} · {expired ? "Expired; return reserved ingredient" : "Waiting for acceptance"}</p><div className={styles.actions}>{incoming && !expired && <button className={css.primary} disabled={busy || !ready || (state.pantry[trade.receive] ?? 0) < 1} onClick={() => void act({ type: "acceptTrade", tradeId: trade.id }, "The ingredients were swapped.")}>Give {ingredientName(trade.receive)} & accept</button>}<button className={css.button} disabled={busy || !ready} onClick={() => void act({ type: "cancelTrade", tradeId: trade.id }, "The reserved ingredient went back to its sender.")}>{expired ? "Return ingredient" : incoming ? "Decline" : "Cancel offer"}</button></div></div></article>; })}</div>{!view.trades.length && <p className={css.small}>No ingredients waiting on an offer.</p>}
    </>}
    {tab === "account" && <>
      {verifiedEmail && <p className={css.notice}>Verified account: {verifiedEmail}</p>}
      <h3 className={css.sectionTitle}>{recover ? "Welcome back" : "Keep your little diner"}</h3><p className={css.panelLead}>{recover ? "Reopen your existing diner with a code sent to its verified email." : "Verify an email so you can reopen this online diner on another device."}</p>
      <form onSubmit={event => { event.preventDefault(); void accountAction(); }}><label className={css.field}>Email<input type="email" autoComplete="email" value={email} disabled={busy || sent} onChange={event => setEmail(event.target.value)} required maxLength={254}/></label>{sent && <label className={css.field}>Email code<input autoComplete="one-time-code" inputMode="numeric" value={token} onChange={event => setToken(event.target.value.replace(/\D/g,""))} maxLength={8} required/></label>}<div className={styles.actions}><button className={css.primary} disabled={busy || (!recover && !ready) || !email || (sent && token.length < 6)}>{busy ? "Working…" : sent ? "Verify code" : "Send email code"}</button><button type="button" className={css.softButton} disabled={busy} onClick={() => { setRecover(value => !value); setSent(false); setToken(""); setNotice(""); }}>{recover ? "Link this diner instead" : "Reopen an existing diner"}</button>{sent && <button type="button" className={css.softButton} disabled={busy} onClick={() => { setSent(false); setToken(""); }}>Change email or resend</button>}</div></form>
    </>}
  </div>;
}

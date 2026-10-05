"use client";
import { useCallback, useEffect, useState } from "react";
import { INGREDIENTS, INGREDIENT_BY_ID } from "@/lib/chef/diner/content";
import { DINER_SOCIAL_RULES, DINER_STICKERS, type DinerSocialCommand } from "@/lib/chef/diner/social";
import { DINER_RULES, type DinerState } from "@/lib/chef/diner/progression";
import type { SyncStatus } from "./diner-sync";
import { DinerIcon } from "./DinerIcon";
import css from "./diner.module.css";
import styles from "./FriendsPanel.module.css";

export interface DinerAccountSession { accessToken: string; refreshToken: string; expiresAt: number; playerId: string; wallet?:string }
export interface FriendsPanelProps {
  state: DinerState; syncStatus: SyncStatus; serverEnabled: boolean;
  connect: () => void | Promise<unknown>;
  read: (path: string, body?: unknown) => Promise<unknown>;
  social: (command: DinerSocialCommand) => Promise<unknown>;
  acceptSession?: (session: DinerAccountSession) => Promise<unknown>;
  signOut?: () => Promise<boolean>;
  onVisit?: (handle: string) => void;
  onNameDiner?: () => void;
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
const visitPath = (handle: string) => `/chef/diner-preview/visit/${handle}`;
/** Accept our public handle or visit link. Never navigate a pasted URL. */
export function dinerHandleFromInput(value: string): string | null {
  const input = value.trim().toLowerCase();
  if (/^diner-[a-f0-9]{16}$/.test(input)) return input;
  try { const url = new URL(input); return /^https?:$/.test(url.protocol) ? url.pathname.match(/^\/(?:chef\/)?diner-preview\/visit\/(diner-[a-f0-9]{16})\/?$/)?.[1] ?? null : null; }
  catch { return null; }
}
export default function FriendsPanel({ state, syncStatus, serverEnabled, connect, read, social, onVisit, signOut, onNameDiner }: FriendsPanelProps) {
  const [view, setView] = useState<SocialView | null>(null), [tab, setTab] = useState<"street" | "trades" | "account">("street");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [handle, setHandle] = useState(""), [target, setTarget] = useState(""), [give, setGive] = useState(() => INGREDIENTS.find(item => (state.pantry[item.id] ?? 0) > 0)?.id ?? "beef"), [receive, setReceive] = useState("tomato");
  const [wallet, setWallet] = useState<string | null>(null);
  const connected = syncStatus !== "guest" && syncStatus !== "connecting", ready = connected && syncStatus !== "offline" && serverEnabled;
  const load = useCallback(async () => { const result = dataOf(await read("social")); if (result.ok === false) throw new Error(String(result.error ?? "The friend list could not be loaded.")); setView(result as unknown as SocialView); }, [read]);
  useEffect(() => { if (!ready) return; let active = true; void read("social").then(value => { const result = dataOf(value); if (result.ok === false) throw new Error(String(result.error ?? "The friend list could not be loaded.")); if (active) setView(result as unknown as SocialView); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "The friend list could not be loaded."); }); return () => { active = false; }; }, [ready, read]);
  useEffect(() => { if (!ready || tab !== "account") return; let active = true; void read("account").then(value => { const account = dataOf(value); if (active && account.verified && typeof account.wallet === "string") setWallet(account.wallet); }).catch(() => {}); return () => { active = false; }; }, [ready, tab, read]);
  async function refresh() { if (busy || !ready) return; setBusy(true); setError(""); try { await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "The friend list could not be loaded."); } finally { setBusy(false); } }
  async function act(command: DinerSocialCommand, message: string) {
    if (busy || !ready) return false; setBusy(true); setError(""); setNotice("");
    try {
      const result = await social(command); if (result === false || (result && typeof result === "object" && dataOf(result).ok === false)) throw new Error("This action did not save. Review your diner and retry.");
      setNotice(message);
      try { await load(); } catch { setError("Your action saved, but the friend list could not refresh. Choose Refresh to see it."); }
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This action could not be saved."); return false; }
    finally { setBusy(false); }
  }
  async function copy(value: string, message: string) { setError(""); try { await navigator.clipboard.writeText(value); setNotice(message); } catch { setError("Copy is unavailable in this browser. Select and copy your friend code below instead."); } }
  const friends = view?.friends.filter(friend => friend.status === "friend") ?? [], received = view?.friends.filter(friend => friend.status === "received") ?? [], sent = view?.friends.filter(friend => friend.status === "sent") ?? [], blocked = view?.friends.filter(friend => friend.status === "blocked") ?? [];
  const discover = view?.discover.filter(diner => !view.friends.some(friend => friend.handle === diner.handle)) ?? [];
  const parsedHandle = dinerHandleFromInput(handle), knownDiner = view?.friends.find(friend => friend.handle === parsedHandle);
  const inviteReason = !view?.profile.published ? "Open your diner to visitors above before sending an invitation." : !parsedHandle ? "Paste their friend code or the visit link they shared with you." : parsedHandle === view.profile.handle ? "That is your code. Ask your friend for theirs." : knownDiner ? knownDiner.status === "received" ? "They already invited you. Accept their request below." : knownDiner.status === "sent" ? "Your invitation is waiting for their reply." : knownDiner.status === "blocked" ? "Unblock this diner below before inviting them." : "You are already friends. Choose Visit to see their diner." : null;
  const giftReason = state.daily.kindness ? "Today's friendship or regular's gift is already collected." : state.daily.minted >= DINER_RULES.ingredientMaximum ? "Today's ingredient allowance is already collected." : null;
  const giftLabel = state.daily.kindness ? "Gift collected today" : giftReason ? "Daily allowance collected" : "Collect friendship gift";
  const tradesToday = view?.profile.tradeDay === state.daily.day ? view.profile.tradesToday : 0;
  const tradeReason = !view?.profile.published ? "Open your diner to visitors before trading." : state.restaurantLevel < DINER_SOCIAL_RULES.tradeLevel ? `Trades open at restaurant level ${DINER_SOCIAL_RULES.tradeLevel}. You are level ${state.restaurantLevel}.` : tradesToday >= DINER_SOCIAL_RULES.tradesPerDay ? "Your five trades are complete for today." : (view?.trades.length ?? 0) >= DINER_SOCIAL_RULES.pendingTrades ? "Resolve a pending offer first. You can have three at a time." : !friends.some(friend => friend.published) ? "Add a friend with an open diner to arrange a trade." : !friends.some(friend => friend.handle === target && friend.published) ? "Choose the friend you want to trade with." : give === receive ? "Choose two different ingredients." : (state.pantry[give] ?? 0) < 1 ? "Choose an ingredient you have in your pantry." : null;
  const visit = (friendHandle: string, name: string, label = "Visit diner") => onVisit ? <button type="button" className={css.button} aria-label={`Visit ${name}`} onClick={() => onVisit(friendHandle)}>{label}</button> : <a className={`${css.button} ${styles.link}`} aria-label={`Visit ${name} in a new tab`} href={visitPath(friendHandle)} target="_blank" rel="noopener noreferrer">{label}</a>;
  if (!serverEnabled) return <div className={`${styles.panel} ${css.empty}`}><DinerIcon name="friends" size={42}/><h3>Friends need an online diner</h3><p>This local sandbox saves only in your browser. Friend codes, invitations and visits become available with a wallet account when the account service opens.</p></div>;
  return <div className={styles.panel}>
    <p className={css.panelLead}>Visit a friend&apos;s diner, leave a compliment, and collect a little kindness for your pantry.</p>
    <div className={`${css.tabs} ${styles.tabs}`} role="group" aria-label="Friends sections">{([['street',`Friends${received.length ? ` · ${received.length} new` : ''}`],['trades','Trades'],['account','Account']] as const).map(([id,label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? css.tabActive : ""} onClick={() => setTab(id)}>{label}</button>)}</div>
    {error && <p className={css.error} role="alert">{error}</p>}{notice && <p className={css.notice} role="status">{notice}</p>}
    {!ready && <div className={css.notice}><p>{syncStatus === "offline" ? "Reconnect to load your friends and save invitations. Your existing friendships are kept." : syncStatus === "connecting" ? "Connecting your wallet account…" : "Sign in with your wallet to join the street."}</p><button className={css.button} disabled={busy || syncStatus === "connecting"} onClick={() => void connect()}>Reconnect saved diner</button></div>}
    {tab !== "account" && ready && !view && <div className={styles.loading}><p role="status">{error ? "Your friend list is waiting for a connection." : "Finding your diner and friends…"}</p><button className={css.button} disabled={busy} onClick={() => void refresh()}>{busy ? "Loading…" : "Try again"}</button></div>}
    {tab === "street" && view && <>
      <section className={styles.profile} aria-labelledby="friend-profile-title">
        <div className={styles.profileTop}><DinerIcon name="home" size={32}/><div><span className={css.eyebrow}>Your diner</span><h3 id="friend-profile-title">{state.home.name}</h3></div>{onNameDiner && <button className={css.button} onClick={onNameDiner}>{state.home.name === "My little diner" ? "Name it" : "Edit name"}</button>}</div>
        {!onNameDiner && <p className={styles.help}>Change your diner&apos;s name in Settings.</p>}
        <p>{view.profile.published ? "Open to visitors. Friends can see your room, menu and keepsakes." : "Your diner is private. Open it to visitors to exchange friend invitations."} <span className={styles.privacy}>Your wallet, coins and pantry stay private.</span></p>
        <div className={styles.actions}><button className={view.profile.published ? css.button : css.primary} disabled={busy || !ready} onClick={() => void act({ type: "publish", enabled: !view.profile.published }, view.profile.published ? "Your diner is private. Your existing friendships are kept." : "Your diner is open. Copy your code or invite someone below.")}>{view.profile.published ? "Make diner private" : "Open to visitors"}</button></div>
        <label className={styles.codeLabel} htmlFor="my-diner-code">Your friend code <span>Already made for you</span></label>
        <input id="my-diner-code" className={styles.code} readOnly value={view.profile.handle} onFocus={event => event.currentTarget.select()}/>
        <div className={styles.actions}><button className={css.button} onClick={() => void copy(view.profile.handle, "Friend code copied. Send it to a friend so they can invite you.")}>Copy friend code</button><button className={css.button} disabled={!view.profile.published} onClick={() => void copy(`${window.location.origin}${visitPath(view.profile.handle)}`, "Visit link copied. Your friend can open it to see your diner.")}>Copy visit link</button></div>
      </section>
      <section className={styles.addFriend} aria-labelledby="add-friend-title">
        <h3 id="add-friend-title">Add a friend</h3><p>Both diners must be open to visitors. Send an invitation; your friend accepts it here in Friends.</p>
        <form onSubmit={event => { event.preventDefault(); if (parsedHandle && !inviteReason) void act({ type: "request", targetHandle: parsedHandle }, "Invitation sent. They can accept it in Friends → Invitations to you.").then(saved => { if (saved) setHandle(""); }); }}>
          <label className={css.field}>Their friend code or visit link<input value={handle} onChange={event => setHandle(event.target.value)} placeholder="Paste diner-… or a visit link" autoCapitalize="none" spellCheck={false} maxLength={512} aria-describedby="friend-invite-help"/></label>
          <p id="friend-invite-help" className={styles.help}>{inviteReason ?? "Ready to invite. Your friend will need to accept before you can collect a friendship gift."}</p>
          <div className={styles.actions}><button className={css.primary} disabled={busy || !ready || !!inviteReason}>Send invitation</button>{parsedHandle && parsedHandle !== view.profile.handle && knownDiner?.status !== "blocked" && knownDiner?.published !== false && visit(parsedHandle, knownDiner?.name ?? "this diner", "Visit first")}</div>
        </form>
      </section>
      <div className={styles.sectionHeading}><h3>Invitations to you {received.length > 0 && <span>{received.length}</span>}</h3><button className={css.button} disabled={busy || !ready} onClick={() => void refresh()}>{busy ? "Updating…" : "Refresh"}</button></div>
      {!received.length && <p className={styles.help}>Requests appear here. Refresh after a friend sends one.</p>}
      <div className={styles.people}>{received.map(friend => <article className={`${styles.person} ${styles.invitation}`} key={friend.handle}><h4>{friend.name}</h4><p>Wants to be your friend.</p>{(!view.profile.published || !friend.published) && <p className={styles.help}>{!view.profile.published ? "Open your diner above to accept." : "Their diner is private. They need to reopen it before you can accept."}</p>}<div className={styles.actions}><button className={css.primary} disabled={busy || !ready || !view.profile.published || !friend.published} onClick={() => void act({ type: "accept", targetHandle: friend.handle }, "You are friends! Visit their diner or collect your daily friendship gift.")}>Accept invitation</button>{friend.published && visit(friend.handle, friend.name)}<button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "remove", targetHandle: friend.handle }, "Invitation declined.")}>Decline</button></div></article>)}</div>
      <div className={styles.sectionHeading}><h3>Your friends <span>{friends.length}</span></h3></div>
      <div className={styles.kindness}><DinerIcon name="gift" size={26}/><p><strong>{state.daily.kindness ? "Today’s kindness is collected" : giftReason ? "Today’s ingredient allowance is collected" : "One friendship ingredient each day"}</strong><span>A friend&apos;s gift and a regular&apos;s gift share this daily allowance. Visit as many friends as you like; the gift is once a day.</span></p></div>
      {!friends.length && <p className={styles.help}>Invite someone above or below. Once they accept, their diner stays in this list.</p>}
      <div className={styles.people}>{friends.map(friend => <article className={styles.person} key={friend.handle}><h4>{friend.name}</h4><p>{friend.published ? "Open to visitors" : "Their diner is private for now."}</p><div className={styles.actions}>{friend.published && visit(friend.handle, friend.name)}<button className={css.button} disabled={busy || !ready || !view.profile.published || !friend.published || !!giftReason} title={giftReason ?? (!view.profile.published || !friend.published ? "Both diners need to be open to visitors." : undefined)} onClick={() => void act({ type: "visitGift", targetHandle: friend.handle }, "One friendship ingredient was added to your pantry. Today's kindness is collected.")}>{giftLabel}</button></div>{!view.profile.published && <p className={styles.help}>Reopen your diner above to collect gifts or leave compliments.</p>}<details className={styles.manage}><summary>Leave a compliment</summary><p className={styles.help}>A sticker for their public diner. Stickers are keepsakes and do not give ingredients.</p><label className={styles.stickerLabel}>Choose a sticker<select className={css.textInput} aria-label={`Leave a sticker for ${friend.name}`} value="" disabled={busy || !ready || !view.profile.published || !friend.published} onChange={event => { if (event.target.value) void act({ type: "sticker", targetHandle: friend.handle, stickerId: event.target.value }, "Your compliment is displayed on their diner."); }}><option value="">Choose a compliment</option>{DINER_STICKERS.map(sticker => <option key={sticker.id} value={sticker.id}>{sticker.name}</option>)}</select></label></details><details className={styles.manage}><summary>Manage friendship</summary><div className={styles.actions}><button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "remove", targetHandle: friend.handle }, "Friendship removed. You can send a new invitation later.")}>Remove friend</button><button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "block", targetHandle: friend.handle }, "Requests, gifts, stickers and trades with this diner are blocked.")}>Block interactions</button></div></details></article>)}</div>
      {sent.length > 0 && <><h3 className={css.sectionTitle}>Invitations you sent</h3><div className={styles.people}>{sent.map(friend => <article className={styles.person} key={friend.handle}><h4>{friend.name}</h4><p>Waiting for them to accept in Friends.</p><div className={styles.actions}>{friend.published && visit(friend.handle, friend.name)}<button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "remove", targetHandle: friend.handle }, "Invitation cancelled.")}>Cancel invitation</button></div></article>)}</div></>}
      <h3 className={css.sectionTitle}>Meet other diners</h3><p className={styles.help}>Public diners you can visit now. Invite one to become friends.</p><div className={styles.people}>{discover.map(diner => <article className={styles.person} key={diner.handle}><h4>{diner.name}</h4><div className={styles.actions}>{visit(diner.handle, diner.name)}<button className={css.button} disabled={busy || !ready || !view.profile.published} onClick={() => void act({ type: "request", targetHandle: diner.handle }, "Invitation sent. They'll find it in Friends.")}>Invite</button></div></article>)}</div>
      {!discover.length && <p className={styles.help}>No new public diners to meet yet. Share your friend code with someone you know, or refresh later.</p>}
      {view.stickers.some(sticker => sticker.count > 0) && <section><h3 className={css.sectionTitle}>Compliments on your diner</h3><div className={styles.visitStickers}>{view.stickers.filter(sticker => sticker.count > 0).map(sticker => <span key={sticker.id}>{sticker.name} · {sticker.count}</span>)}</div></section>}
      {blocked.length > 0 && <details className={styles.manage}><summary>Blocked diners · {blocked.length}</summary>{blocked.map(friend => <div className={styles.blocked} key={friend.handle}><span>{friend.name}</span><button className={css.softButton} disabled={busy || !ready} onClick={() => void act({ type: "unblock", targetHandle: friend.handle }, "Block removed. Send a new invitation to become friends again.")}>Unblock</button></div>)}</details>}
    </>}
    {tab === "trades" && view && <>
      <h3 className={css.sectionTitle}>Swap a spare ingredient</h3><p className={css.panelLead}>Both friends need restaurant level {DINER_SOCIAL_RULES.tradeLevel}. Offer one ingredient and ask for one; your friend chooses whether to accept.</p><p className={styles.help}>Your ingredient is set aside until accepted or returned. Offers last 24 hours; either friend can cancel. Each diner can complete five trades a day.</p>
      <p className={css.badge}>{tradesToday} / {DINER_SOCIAL_RULES.tradesPerDay} trades today</p>
      <form onSubmit={event => { event.preventDefault(); if (!tradeReason) void act({ type: "offerTrade", targetHandle: target, give, receive }, "Offer sent. Your ingredient is set aside until acceptance or cancellation."); }} className={styles.tradeForm}>
        <label className={css.field}>Friend<select value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose a friend</option>{friends.filter(friend => friend.published).map(friend => <option key={friend.handle} value={friend.handle}>{friend.name}</option>)}</select></label>
        <label className={css.field}>Give one<select value={give} onChange={event => setGive(event.target.value)}>{INGREDIENTS.map(ingredient => <option key={ingredient.id} value={ingredient.id} disabled={(state.pantry[ingredient.id] ?? 0) < 1}>{ingredient.name} · {state.pantry[ingredient.id] ?? 0} owned</option>)}</select></label>
        <label className={css.field}>Ask for one<select value={receive} onChange={event => setReceive(event.target.value)}>{INGREDIENTS.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></label>
        <button className={css.primary} disabled={busy || !ready || !!tradeReason}>Set aside & offer</button>
      </form>{tradeReason && <p className={styles.help}>{tradeReason}</p>}
      <h3 className={css.sectionTitle}>Pending offers</h3><div className={styles.people}>{view.trades.map(trade => {
        const incoming = trade.toHandle === view.profile.handle, expired = Date.now() >= trade.expiresAt, other = view.friends.find(friend => friend.handle === (incoming ? trade.fromHandle : trade.toHandle));
        const acceptReason = !view.profile.published || !other?.published ? "Both diners must be open to visitors." : other.status !== "friend" ? "This offer requires an accepted friendship." : state.restaurantLevel < DINER_SOCIAL_RULES.tradeLevel ? "Reach restaurant level 8 to accept." : tradesToday >= DINER_SOCIAL_RULES.tradesPerDay ? "Your daily trades are complete." : (state.pantry[trade.receive] ?? 0) < 1 ? `You need one ${ingredientName(trade.receive)} to accept.` : null;
        return <article className={styles.person} key={trade.id}><h4>{incoming ? `Receive ${ingredientName(trade.give)}` : `Offer: ${ingredientName(trade.give)}`}</h4><p>{incoming ? `Give one ${ingredientName(trade.receive)} to ${other?.name ?? trade.fromHandle}.` : `Ask ${other?.name ?? trade.toHandle} for one ${ingredientName(trade.receive)}.`}</p><p className={styles.help}>{expired ? "Expired. Return the ingredient set aside for this offer." : incoming ? "Nothing moves until you accept." : "Waiting for your friend to accept."}</p>{incoming && !expired && acceptReason && <p className={styles.help}>{acceptReason}</p>}<div className={styles.actions}>{incoming && !expired && <button className={css.primary} disabled={busy || !ready || !!acceptReason} onClick={() => void act({ type: "acceptTrade", tradeId: trade.id }, "The ingredients were swapped.")}>Accept swap</button>}<button className={css.button} disabled={busy || !ready} onClick={() => void act({ type: "cancelTrade", tradeId: trade.id }, "The ingredient was returned to its sender.")}>{expired ? "Return ingredient" : incoming ? "Decline" : "Cancel offer"}</button></div></article>;
      })}</div>{!view.trades.length && <p className={styles.help}>No open offers. An offer from a friend appears here; refresh to check.</p>}<button className={css.button} disabled={busy || !ready} onClick={() => void refresh()}>Refresh offers</button>
    </>}
    {tab === "account" && <>
      <h3 className={css.sectionTitle}>Your wallet is your account</h3><p className={css.panelLead}>Reconnect the same wallet on another device to reopen this diner.</p>{wallet && <p className={css.notice} style={{overflowWrap:'anywhere'}}>{wallet}</p>}<p className={styles.help}>Sign-in only asks for a message signature. No transaction, gas fee or permission to spend your assets.</p><div className={styles.actions}><button className={css.button} disabled={busy || syncStatus === 'connecting'} onClick={() => void connect()}>Reconnect saved diner</button>{signOut && <button className={css.button} disabled={busy || syncStatus === 'connecting'} onClick={() => { setBusy(true); void signOut().catch(reason => setError(reason instanceof Error ? reason.message : "Sign-out could not finish. Please try again.")).finally(() => setBusy(false)); }}>Sign out this device</button>}</div>
    </>}
  </div>;
}

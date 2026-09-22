import "server-only";
import { DinerAuthorityError } from "./authority";
import { createSocialProfile, DINER_STICKERS, type DinerFriendship, type DinerSocialProfile, type DinerTrade } from "./social";
import { dinerDb } from "./server";
type Database = ReturnType<typeof dinerDb>;
export async function loadSocialProfile(db: Database, player: string, now: number): Promise<DinerSocialProfile> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await db.from("diner_preview_profiles").select("social").eq("player_id", player).maybeSingle();
    if (result.error) throw new DinerAuthorityError("social_unavailable", "The preview street has not been prepared or could not be reached.", 503);
    if (result.data) return result.data.social as DinerSocialProfile;
    const initialized = await db.rpc("diner_preview_social_initialize", { p_player: player, p_profile: createSocialProfile(player, now) });
    if (initialized.error) throw new DinerAuthorityError("social_unavailable", "This diner could not join the preview street.", 503);
  }
  throw new DinerAuthorityError("social_unavailable", "Please reconnect to the preview street.", 503);
}
export async function findDinerByHandle(db: Database, handle: string) {
  const result = await db.from("diner_preview_profiles").select("player_id,social,published").eq("handle", handle).maybeSingle();
  if (result.error) throw new DinerAuthorityError("social_unavailable", "That diner could not be checked.", 503);
  if (!result.data) throw new DinerAuthorityError("diner_unavailable", "That diner is unavailable.", 404);
  return result.data as { player_id: string; social: DinerSocialProfile; published: boolean };
}
export async function loadFriendship(db: Database, actor: string, target: string): Promise<DinerFriendship | null> {
  const [left, right] = [actor, target].sort(), result = await db.from("diner_preview_friendships").select("state").eq("left_id", left).eq("right_id", right).maybeSingle();
  if (result.error) throw new DinerAuthorityError("social_unavailable", "This friendship could not be checked.", 503);
  return result.data?.state ?? null;
}
export async function loadTrade(db: Database, id: string, actor: string): Promise<DinerTrade> {
  const result = await db.from("diner_preview_trades").select("state").eq("id", id).maybeSingle();
  if (result.error) throw new DinerAuthorityError("social_unavailable", "This trade could not be checked.", 503);
  const trade = result.data?.state as DinerTrade | undefined;
  if (!trade || (trade.from !== actor && trade.to !== actor)) throw new DinerAuthorityError("trade_unavailable", "That trade is unavailable.", 404);
  return trade;
}
export async function dinerSocialSnapshot(db: Database, player: string, profile: DinerSocialProfile) {
  const results = await Promise.all([
    db.from("diner_preview_friendships").select("state").or(`left_id.eq.${player},right_id.eq.${player}`).limit(200),
    db.from("diner_preview_profiles").select("player_id,social").eq("published", true).order("handle").limit(40),
    db.from("diner_preview_trades").select("state").or(`from_id.eq.${player},to_id.eq.${player}`).eq("status", "pending").limit(10),
  ]);
  if (results.some(result => result.error)) throw new DinerAuthorityError("social_unavailable", "The preview street is unavailable.", 503);
  const pairs = (results[0].data ?? []).map(row => row.state as DinerFriendship), trades = (results[2].data ?? []).map(row => row.state as DinerTrade);
  const ids = [...new Set([player, ...pairs.flatMap(pair => [pair.left, pair.right]), ...trades.flatMap(trade => [trade.from, trade.to]), ...(results[1].data ?? []).map(row => row.player_id as string)])];
  const [profiles, players] = await Promise.all([db.from("diner_preview_profiles").select("player_id,social").in("player_id", ids), db.from("diner_preview_players").select("player_id,state").in("player_id", ids)]);
  if (profiles.error || players.error) throw new DinerAuthorityError("social_unavailable", "Diner names could not be checked.", 503);
  const byId = new Map((profiles.data ?? []).map(row => [row.player_id as string, row.social as DinerSocialProfile]));
  const names = new Map((players.data ?? []).map(row => [row.player_id as string, String(row.state?.home?.name ?? "A little diner")]));
  const blocked = new Set(pairs.filter(pair => pair.blockedBy.length).flatMap(pair => [pair.left, pair.right]).filter(id => id !== player));
  return {
    profile: { handle: profile.handle, published: profile.published, tradesToday: profile.trades, tradeDay: profile.day },
    friends: pairs.filter(pair => pair.accepted || pair.requester || pair.blockedBy.includes(player)).map(pair => { const other = pair.left === player ? pair.right : pair.left; return { handle: byId.get(other)?.handle ?? "", name: names.get(other) ?? "A little diner", status: pair.blockedBy.includes(player) ? "blocked" : pair.accepted ? "friend" : pair.requester === player ? "sent" : "received", published: byId.get(other)?.published ?? false }; }).filter(friend => !!friend.handle),
    discover: (results[1].data ?? []).filter(row => row.player_id !== player && !blocked.has(row.player_id)).map(row => ({ handle: (row.social as DinerSocialProfile).handle, name: names.get(row.player_id) ?? "A little diner" })),
    trades: trades.map(trade => ({ id: trade.id, fromHandle: byId.get(trade.from)?.handle ?? "", toHandle: byId.get(trade.to)?.handle ?? "", give: trade.give, receive: trade.receive, status: trade.status, expiresAt: trade.expiresAt })),
    stickers: DINER_STICKERS.map(sticker => ({ ...sticker, count: profile.stickers[sticker.id] ?? 0 })),
  };
}

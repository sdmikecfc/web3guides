import { NextResponse } from "next/server";
import { CONTENT_VERSION } from "@/lib/chef/diner/content";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
import { dinerDb, dinerFingerprint, dinerPlayer, dinerSnapshot, loadDinerRecord } from "@/lib/chef/diner/server";
import { dinerSocialSnapshot, findDinerByHandle, loadFriendship, loadSocialProfile, loadTrade } from "@/lib/chef/diner/social-server";
import { replayDinerSocial, validateSocialCommand, type DinerSocialInput } from "@/lib/chef/diner/social";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const errorResponse = (error: unknown) => respond({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "social_unavailable", error: error instanceof DinerAuthorityError ? error.message : "The preview street is unavailable." }, error instanceof DinerAuthorityError ? error.status : 503);
export async function GET(req: Request) {
  try { const db = dinerDb(), player = await dinerPlayer(req), now = Date.now(); await loadDinerRecord(db, player, now); return respond({ ok: true, ...await dinerSocialSnapshot(db, player, await loadSocialProfile(db, player, now)) }); } catch (error) { return errorResponse(error); }
}
export async function POST(req: Request) {
  try {
    const db = dinerDb(), player = await dinerPlayer(req), raw = await req.text(); if (raw.length > 8192) throw new DinerAuthorityError("input_too_large", "That social action is too large.", 413);
    let body; try { body = JSON.parse(raw); } catch { throw new DinerAuthorityError("invalid_json", "Choose a street action."); }
    if (!body || Object.keys(body).some(key => !["id", "revision", "command"].includes(key)) || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) || !Number.isSafeInteger(body.revision) || body.revision < 0) throw new DinerAuthorityError("invalid_envelope", "A street action needs its ID and saved revision.");
    const command = validateSocialCommand(body.command), now = Date.now(), actor = await loadDinerRecord(db, player, now), profile = await loadSocialProfile(db, player, now), fingerprint = dinerFingerprint({ social: command });
    const receipt = await db.from("diner_preview_commands").select("fingerprint").eq("player_id", player).eq("command_id", body.id).maybeSingle();
    if (receipt.error) throw new DinerAuthorityError("social_unavailable", "This action could not be checked. Retry its same ID.", 503);
    if (receipt.data) { if (receipt.data.fingerprint !== fingerprint) throw new DinerAuthorityError("id_reused", "This action ID belongs to different inputs.", 409); return respond({ ...dinerSnapshot(actor), duplicate: true, social: await dinerSocialSnapshot(db, player, profile) }); }
    if (actor.revision !== body.revision) return respond({ ...dinerSnapshot(actor), ok: false, code: "conflict", error: "Your diner changed elsewhere. Review the saved version." }, 409);
    const input: DinerSocialInput = { actorId: player, actor, actorProfile: profile };
    if ("tradeId" in command) { input.trade = await loadTrade(db, command.tradeId, player); input.targetId = input.trade.from === player ? input.trade.to : input.trade.from; }
    else if ("targetHandle" in command) input.targetId = (await findDinerByHandle(db, command.targetHandle)).player_id;
    if (input.targetId) { input.target = await loadDinerRecord(db, input.targetId, now); input.targetProfile = await loadSocialProfile(db, input.targetId, now); input.friendship = await loadFriendship(db, player, input.targetId); }
    const result = replayDinerSocial(input, command, { now, commandId: body.id });
    const commit = await db.rpc("diner_preview_social_commit", { p_actor: player, p_target: result.targetId ?? null, p_actor_revision: actor.revision, p_target_revision: input.target?.revision ?? null, p_command: body.id, p_fingerprint: fingerprint, p_actor_state: result.actor.state, p_target_state: result.target?.state ?? null, p_actor_social: result.actorProfile, p_target_social: result.targetProfile ?? null, p_pair: result.friendship ?? null, p_trade: result.trade ?? null, p_input: { type: "social", command }, p_server_time_ms: now, p_content_version: CONTENT_VERSION });
    if (commit.error) throw new DinerAuthorityError("social_unavailable", "The save is uncertain. Retry this same action ID.", 503);
    const canonical = await loadDinerRecord(db, player, now);
    if (!commit.data?.ok) return respond({ ...dinerSnapshot(canonical), ok: false, code: commit.data?.code ?? "conflict", error: "A diner changed while saving. Review the latest state." }, 409);
    return respond({ ...dinerSnapshot(canonical), duplicate: !!commit.data.duplicate, social: await dinerSocialSnapshot(db, player, await loadSocialProfile(db, player, now)) });
  } catch (error) { return errorResponse(error); }
}

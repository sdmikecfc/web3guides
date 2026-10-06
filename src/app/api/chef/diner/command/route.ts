import { NextResponse } from "next/server";
import { CONTENT_VERSION } from "@/lib/chef/diner/content";
import { DINER_AUTHORITY_RULES, DinerAuthorityError, replayDiner, validateDinerEnvelope } from "@/lib/chef/diner/authority";
import { dinerDb, dinerFingerprint, dinerPlayer, dinerSnapshot, loadDinerRecord } from "@/lib/chef/diner/server";
import {requireDinerWalletSession} from '@/lib/chef/diner/wallet-auth-server';
import type {JourneyRewardEvidence} from '@/lib/chef/diner/domain-journey-rewards';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  try {
    const db = dinerDb(), player = await dinerPlayer(req), raw = await req.text();
    if (raw.length > DINER_AUTHORITY_RULES.maxBytes) return respond({ ok: false, error: "That action is too large." }, 413);
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new DinerAuthorityError("invalid_json", "Choose a valid preview action."); }
    const envelope = validateDinerEnvelope(parsed), now = Date.now(), current = await loadDinerRecord(db, player, now), fingerprint = dinerFingerprint(envelope.commands);
    const receipt = await db.from("diner_preview_commands").select("fingerprint").eq("player_id", player).eq("command_id", envelope.id).maybeSingle();
    if (receipt.error) throw new DinerAuthorityError("preview_unavailable", "This action could not be checked. Retry its same ID.", 503);
    if (receipt.data) { if (receipt.data.fingerprint !== fingerprint) throw new DinerAuthorityError("id_reused", "An action ID cannot be reused for different inputs.", 409); return respond({ ...dinerSnapshot(current), duplicate: true }); }
    if (current.revision !== envelope.revision) return respond({ ...dinerSnapshot(current), ok: false, code: "conflict", error: "Your preview changed elsewhere. Review the updated diner." }, 409);
    let verifiedRallyTrophy=false;if(envelope.commands.some(c=>c.type==='claimRallyTrophy')){const proof=await db.from('diner_ranked_entitlements').select('first_completion').eq('player_id',player).maybeSingle();if(proof.error)throw new DinerAuthorityError('ranked_unavailable','The verified trophy could not be checked.',503);verifiedRallyTrophy=!!proof.data;}
    let verifiedCommunityPlaque=false;if(envelope.commands.some(c=>c.type==='claimCommunityPlaque')){const proof=await db.from('diner_community_entitlements').select('event_id').eq('event_id','neighbourhood-picnic-v1').eq('player_id',player).maybeSingle();if(proof.error)throw new DinerAuthorityError('community_unavailable','The picnic plaque could not be checked.',503);verifiedCommunityPlaque=!!proof.data;}
    let verifiedJourneyRewards:JourneyRewardEvidence|undefined;
    if(envelope.commands.some(c=>c.type==='claimDomainJourneyRewards')){
      const {wallet}=await requireDinerWalletSession(db,req.headers.get('authorization')!.slice(7),player),proof=await db.from('diner_domain_journey_rewards').select('domain,milestone,receipt_key,earned_at').eq('wallet',wallet);
      if(proof.error)throw new DinerAuthorityError('journey_unavailable','Journey rewards could not be checked.',503);verifiedJourneyRewards={wallet,rewards:proof.data as JourneyRewardEvidence['rewards']};
    }
    const result = replayDiner(current, envelope.commands, now,verifiedRallyTrophy,verifiedCommunityPlaque,verifiedJourneyRewards);
    const committed = await db.rpc("diner_preview_commit", { p_player: player, p_command: envelope.id, p_fingerprint: fingerprint, p_expected_revision: envelope.revision,
      p_state: result.record.state, p_clock: result.record.clock, p_commands: result.accepted, p_run_id: result.record.state.run?.id ?? current.state.run?.id ?? null, p_content_version: CONTENT_VERSION, p_server_time_ms: now });
    if (committed.error) throw new DinerAuthorityError("preview_unavailable", "The save is uncertain. Retry this same action ID.", 503);
    const latest = await loadDinerRecord(db, player, now);
    if (!committed.data?.ok) return respond({ ...dinerSnapshot(latest), ok: false, code: committed.data?.code ?? "conflict", error: "The preview changed while saving. Review the updated diner." }, 409);
    return respond({ ...dinerSnapshot(latest), duplicate: !!committed.data.duplicate, interrupted: result.interrupted });
  } catch (error) { return respond({ ok: false, code: error instanceof DinerAuthorityError ? error.code : "preview_unavailable", error: error instanceof DinerAuthorityError ? error.message : "The preview service is unavailable.", ...(error instanceof DinerAuthorityError && error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) }, error instanceof DinerAuthorityError ? error.status : 503); }
}

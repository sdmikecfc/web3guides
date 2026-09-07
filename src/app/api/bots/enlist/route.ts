/**
 * BATTLE BOTS ENLIST. POST /api/bots/enlist
 *
 * Port of the proven wallet-first enlist (src/app/api/s7/join/route.ts)
 * onto battle_bots_players, plus the play session the S7 game-session
 * route mints (src/app/api/s7/game-session/route.ts), folded into ONE
 * signature.
 *
 * THREE STEPS TO JOIN (Mike, 2026-09-04): open the site, connect the wallet,
 * play. This route is the whole of "connect": there is no Discord, no bot
 * command, no linking code, no waiting period and no second account. A wallet
 * that can sign gets a seat, a starter kit and a robot already standing in
 * bay 1 (_server/players.ts), and the very next press starts a fight.
 *
 *   Body { address, message?, signature? }
 *   RETURNING wallet, no signature  -> recognised instantly, no token yet
 *                                      ({ needsSignature: true } for a session)
 *   NEW wallet, no signature        -> { ok: false, needsSignature: true }
 *   any wallet WITH a signature     -> the two checks below, then enlisted if
 *                                      new, and a session token is returned.
 *
 * THE TWO CHECKS, in this order, both fail-closed:
 *   1. the signature is real: viem verifyMessage plus the 5 minute freshness
 *      window and the domain allowlist (src/lib/stars/server verifyOwnership,
 *      what the s7 routes use).
 *   2. the NONCE the message carries was issued by this server, for THIS
 *      wallet, is still inside its five minutes, and has not been spent
 *      (./nonce-store.ts). The nonce is read out of the SIGNED MESSAGE, not
 *      out of the JSON body, so it is covered by the signature. Before this
 *      the Nonce line was invented by the browser and checked by nobody, so
 *      one captured message and signature could be posted again.
 *
 * WHY THE ORDER. The signature comes first because everything after it is
 * about a wallet we have not proved yet.
 *
 * WHY THERE IS NO THIRD CHECK ANY MORE. There used to be an identity gate
 * here: a Discord account bound to the wallet, one per wallet, three days
 * old. It existed because one person spreading their trading over several
 * wallets used to be paid more than the same trading in one, and no rule that
 * only looks at wallets can tell a farm of twenty five seats from twenty five
 * honest players. That is still true, and it is still answered, but in the
 * MONEY rules rather than at the door: a wallet is only paid for a week it
 * really traded, so a seat costs real trading and costs an honest player
 * nothing to open. Joining is free, anonymous and instant on purpose.
 *
 * WHAT THE RESPONSE NEVER CARRIES: a wallet address, or a dollar figure.
 *
 * `x-bots-test: 1` marks the new player is_test, honoured only when
 * NODE_ENV !== "production" (db.ts devTestFlag).
 */
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { verifyOwnership } from "@/lib/s7/server";
import { botsDb, devTestFlag, failResponse, readJson } from "@/app/bots/_server/db";
import { coinsOf, displayName, enlistPlayer, loadPlayer } from "@/app/bots/_server/players";
import { campaignEnrollment } from "@/app/bots/_server/campaign-enrollment";
import { mintSession } from "@/app/bots/_server/session";
import type { EnlistView } from "@/app/bots/_server/types";
import { burnNonce, nonceInMessage } from "./nonce-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ address?: string; message?: string; signature?: string }>(req);
    const { address, message, signature } = body || {};
    if (!address || !isAddress(address)) return NextResponse.json({ ok: false, error: "Connect a wallet first." }, { status: 400 });
    const wallet = getAddress(address).toLowerCase();
    const db = botsDb();

    if (!message || !signature) {
      const existing = await loadPlayer(db, wallet);
      if (!existing) return NextResponse.json({ ok: false, needsSignature: true });
      const view: EnlistView = {
        ok: true,
        joined: false,
        welcomeBack: true,
        walletName: displayName(existing),
        coins: coinsOf(existing),
        needsSignature: true,
      };
      return NextResponse.json(view);
    }

    // 1) the signature
    const v = await verifyOwnership(message, signature, address);
    if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });

    // 2) the nonce, read out of the message the wallet actually signed
    await burnNonce(db, wallet, nonceInMessage(message));

    // the seat, the starter kit and the robot in bay 1, all idempotent
    const { player, joined } = await enlistPlayer(db, wallet, devTestFlag(req));
    await campaignEnrollment(db, wallet, true, !!player.is_test);
    const view: EnlistView = {
      ok: true,
      joined,
      welcomeBack: !joined,
      token: mintSession(wallet, !!player.is_test),
      walletName: displayName(player),
      coins: coinsOf(player),
    };
    return NextResponse.json(view);
  } catch (e) {
    return failResponse(e);
  }
}

import { NextResponse } from "next/server";
import { dinerAuthClient, dinerDb } from "@/lib/chef/diner/server";
import { requireDinerWalletSession } from "@/lib/chef/diner/wallet-auth-server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Refresh only an existing wallet-issued session; never create anonymous users. */
export async function POST(req: Request) {
  try {
    const raw=await req.text();if(raw.length>8192)throw new DinerAuthorityError("input_too_large","Session request too large.",413);
    let body;try{body=JSON.parse(raw);}catch{throw new DinerAuthorityError("wallet_required","Sign in with your wallet first.",401);}
    if(!body||typeof body.refreshToken!=="string"||!body.refreshToken||body.refreshToken.length>4096||Object.keys(body).some(key=>key!=="refreshToken"))throw new DinerAuthorityError("wallet_required","Sign in with your wallet first.",401);
    const auth=dinerAuthClient(),result=await auth.auth.refreshSession({refresh_token:body.refreshToken}),session=result.data.session;
    if(result.error||!session)throw new DinerAuthorityError("session_expired","Sign in with your wallet again to reopen your diner.",401);
    const checked=await auth.auth.getUser(session.access_token);if(checked.error||checked.data.user?.id!==session.user.id)throw new DinerAuthorityError("session_expired","Sign in with your wallet again to reopen your diner.",401);
    const {wallet}=await requireDinerWalletSession(dinerDb(),session.access_token,session.user.id);
    return NextResponse.json({ok:true,accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:session.expires_at,playerId:session.user.id,wallet},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return NextResponse.json({ok:false,code:error instanceof DinerAuthorityError?error.code:"session_unavailable",error:error instanceof DinerAuthorityError?error.message:"The wallet account service is unavailable."},{status:error instanceof DinerAuthorityError?error.status:503,headers:{"Cache-Control":"no-store"}});}
}

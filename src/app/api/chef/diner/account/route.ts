import { NextResponse } from "next/server";
import { DinerAuthorityError } from "@/lib/chef/diner/authority";
import { dinerDb, dinerPlayer } from "@/lib/chef/diner/server";
import { requireDinerWalletSession } from "@/lib/chef/diner/wallet-auth-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:Request){
  try{const player=await dinerPlayer(req),token=req.headers.get("authorization")!.slice(7),{wallet}=await requireDinerWalletSession(dinerDb(),token,player);return respond({ok:true,wallet,verified:true,account:"wallet"});}
  catch(error){return respond({ok:false,error:error instanceof DinerAuthorityError?error.message:"The account service is unavailable."},error instanceof DinerAuthorityError?error.status:503);}
}
export async function POST(){return respond({ok:false,code:"wallet_account",error:"Your wallet is your account. Reconnect the same wallet to reopen your diner."},410);}

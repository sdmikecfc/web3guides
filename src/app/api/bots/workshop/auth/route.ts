import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { isAddress, verifyMessage } from "viem";
import { botsDb, sessionSecret } from "@/app/bots/_server/db";
import { mintSession } from "@/app/bots/_server/session";
import { requireWorkshop, workshopError } from "@/app/bots/_server/workshop8";
import { burnNonce, nonceInMessage } from "../../enlist/nonce-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  try{requireWorkshop();sessionSecret();const {error}=await botsDb().from("mk8_workshops").select("revision").limit(1);if(error)throw Error("Workshop migration missing");return NextResponse.json({ok:true,ready:true},{headers:{"Cache-Control":"no-store"}})}
  catch{return NextResponse.json({ok:true,ready:false,message:"Wallet saves are being set up. You can keep playing on this device."},{headers:{"Cache-Control":"no-store"}})}
}
export async function POST(req:Request){
  try{
    requireWorkshop();sessionSecret();const raw=await req.text();if(raw.length>10000)throw Error("Invalid sign-in");const body=JSON.parse(raw);
    if(!isAddress(body.address)||typeof body.message!=="string"||typeof body.signature!=="string")return NextResponse.json({ok:false,error:"Sign the wallet message to continue."},{status:400});
    const msg=new SiweMessage(body.message),url=new URL(req.url),now=Date.now(),issued=Date.parse(msg.issuedAt??"");
    if(msg.domain!==url.host||msg.uri!==url.origin||msg.statement!=="Sign in to save your Model Kombat garage. No payment or token approval."||msg.address.toLowerCase()!==body.address.toLowerCase()||msg.version!=="1"||msg.chainId!==1||!Number.isFinite(issued)||issued>now+30000||issued<now-300000||!await verifyMessage({address:body.address,message:body.message,signature:body.signature}))return NextResponse.json({ok:false,error:"This sign-in message expired or does not match this site. Try again."},{status:401});
    await burnNonce(botsDb(),body.address.toLowerCase(),nonceInMessage(body.message));
    return NextResponse.json({ok:true,wallet:body.address.toLowerCase(),token:mintSession(body.address,false)},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return workshopError(e)}
}

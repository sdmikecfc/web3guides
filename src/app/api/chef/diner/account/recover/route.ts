import { NextResponse } from "next/server";
export const dynamic="force-dynamic";
/** Email recovery cannot replace the required wallet proof. */
export async function POST(){return NextResponse.json({ok:false,code:"wallet_required",error:"Reconnect the same wallet and sign a new sign-in message to reopen your diner."},{status:410,headers:{"Cache-Control":"no-store"}});}

import { NextResponse } from "next/server";
import { workshopGet,workshopPost,workshopError } from "@/app/bots/_server/workshop8";
import { journeyEnabled, journeyGet, journeyPost } from '@/app/bots/_server/workshop-journey';
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(req:Request){try{return NextResponse.json(await (journeyEnabled()?journeyGet(req):workshopGet(req)),{headers:{"Cache-Control":"no-store"}})}catch(e){return workshopError(e)}}
export async function POST(req:Request){try{if(Number(req.headers.get("content-length"))>25000)return NextResponse.json({ok:false,error:"This request is too large."},{status:413});const text=await req.text();if(text.length>25000)return NextResponse.json({ok:false,error:"This request is too large."},{status:413});return NextResponse.json(await (journeyEnabled()?journeyPost(req,JSON.parse(text)):workshopPost(req,JSON.parse(text))),{headers:{"Cache-Control":"no-store"}})}catch(e){return workshopError(e)}}

import { NextResponse } from "next/server";
import { botsDb } from "@/app/bots/_server/db";
import { requireWorkshop,workshopError } from "@/app/bots/_server/workshop8";
export const dynamic="force-dynamic";
export async function GET(){try{requireWorkshop();const {data,error}=await botsDb().from('mk8_public_fights').select('replay').order('completed_at',{ascending:false}).limit(12);if(error)throw error;return NextResponse.json({ok:true,fights:(data??[]).map(r=>r.replay)},{headers:{'Cache-Control':'no-store'}})}catch(e){return workshopError(e)}}

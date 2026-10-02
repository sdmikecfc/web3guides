import { NextResponse } from "next/server";
import { botsDb } from "@/app/bots/_server/db";
import { requireWorkshop,workshopError } from "@/app/bots/_server/workshop8";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:{id:string}}){try{requireWorkshop();if(!/^[0-9a-f-]{36}$/i.test(params.id))return NextResponse.json({ok:false,error:'Fight not found.'},{status:404});const {data,error}=await botsDb().from('mk8_public_fights').select('replay').eq('id',params.id).maybeSingle();if(error)throw error;if(!data)return NextResponse.json({ok:false,error:'Fight not found.'},{status:404});return NextResponse.json({ok:true,fight:data.replay},{headers:{'Cache-Control':'public, max-age=31536000, immutable'}})}catch(e){return workshopError(e)}}

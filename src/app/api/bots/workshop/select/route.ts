import { NextResponse } from 'next/server';
import { journeyEnabled, journeySelect } from '@/app/bots/_server/workshop-journey';
import { workshopError } from '@/app/bots/_server/workshop8';
import { Refusal } from '@/app/bots/_server/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 if(!journeyEnabled())throw new Refusal(503,'Guest saves are not open yet.');
 const text=await req.text();if(text.length>1000)throw new Refusal(400,'Choose a saved garage.');
 let body;try{body=JSON.parse(text)}catch{throw new Refusal(400,'Choose a saved garage.')}
 return NextResponse.json(await journeySelect(req,body?.garageId),{headers:{'Cache-Control':'no-store'}});
}catch(e){return workshopError(e)}}

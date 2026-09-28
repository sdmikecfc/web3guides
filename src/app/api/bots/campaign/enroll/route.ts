import { NextResponse } from 'next/server';
import { enrollWorkshopCompetition } from '@/app/bots/_server/workshop-competition';
import { workshopError } from '@/app/bots/_server/workshop8';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{return NextResponse.json(await enrollWorkshopCompetition(req),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return workshopError(e)}}

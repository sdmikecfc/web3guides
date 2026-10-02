import { NextResponse } from 'next/server';
import { enrollWorkshopCompetition } from '@/app/bots/_server/workshop-competition';
import { workshopError } from '@/app/bots/_server/workshop8';
import {tokenZonesEnabled,enterTokenZones} from '@/app/bots/_server/token-zones';
import {zoneWorkshopStatus} from '@/lib/bots/workshop8/token-zone-status';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{if(tokenZonesEnabled()){const result=await enterTokenZones(req);return NextResponse.json({...result,competition:zoneWorkshopStatus(result.zones)},{headers:{'Cache-Control':'private, no-store'}})}return NextResponse.json(await enrollWorkshopCompetition(req),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return workshopError(e)}}

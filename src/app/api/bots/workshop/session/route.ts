import { journeySession } from '@/app/bots/_server/workshop-journey';
import { workshopError } from '@/app/bots/_server/workshop8';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{return await journeySession(req)}catch(e){return workshopError(e)}}
export async function POST(req:Request){try{return await journeySession(req,true)}catch(e){return workshopError(e)}}

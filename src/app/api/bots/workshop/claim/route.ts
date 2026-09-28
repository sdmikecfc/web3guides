import { journeyClaim, journeyEnabled } from '@/app/bots/_server/workshop-journey';
import { workshopError } from '@/app/bots/_server/workshop8';
import { Refusal } from '@/app/bots/_server/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{if(!journeyEnabled())throw new Refusal(503,'Guest saves are not open yet.');return await journeyClaim(req)}catch(e){return workshopError(e)}}

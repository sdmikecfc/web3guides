import {zoneFeedCheck} from '@/app/bots/_server/token-zones';
import {failResponse} from '@/app/bots/_server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{return Response.json(await zoneFeedCheck(req),{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return failResponse(e);}
}

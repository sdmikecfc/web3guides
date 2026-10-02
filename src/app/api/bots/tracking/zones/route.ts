import {zoneFeedGet,zoneFeedPost} from '@/app/bots/_server/token-zones';
import {failResponse} from '@/app/bots/_server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){try{return Response.json(await zoneFeedGet(req),{headers:{'Cache-Control':'no-store'}});}catch(e){return failResponse(e);}}
export async function POST(req:Request){try{return Response.json(await zoneFeedPost(req),{headers:{'Cache-Control':'no-store'}});}catch(e){return failResponse(e);}}

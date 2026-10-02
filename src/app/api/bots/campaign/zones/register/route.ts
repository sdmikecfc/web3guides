import {registerTokenZoneWallet} from '@/app/bots/_server/token-zone-registration';
import {sessionFromRequest} from '@/app/bots/_server/session';
import {sameOrigin} from '@/app/bots/_server/workshop-journey';
import {Refusal,failResponse} from '@/app/bots/_server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{
  sameOrigin(req);
  if(process.env.BOTS_TOKEN_ZONES!=='1')throw new Refusal(409,'Token-zone tracking is not enabled.');
  const auth=sessionFromRequest(req);
  if(!auth)throw new Refusal(401,'Connect and sign in first.');
  if(auth.isTest)throw new Refusal(403,'Test sessions cannot register for prizes.');
  await registerTokenZoneWallet(auth.wallet);
  return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return failResponse(e)}
}

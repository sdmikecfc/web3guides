import 'server-only';
import {botsDb,Refusal} from './db';

// Called only with a verified sign-in or an authenticated server session.
// Registration queues discovery; it does not enter a competition or create coins.
export async function registerTokenZoneWallet(wallet:string){
 if(process.env.BOTS_TOKEN_ZONES!=='1')return;
 const {error}=await botsDb().rpc('mkz_register_wallet',{p_wallet:wallet.toLowerCase()});
 if(error)throw new Refusal(503,'Wallet tracking could not be saved. Please retry.');
}

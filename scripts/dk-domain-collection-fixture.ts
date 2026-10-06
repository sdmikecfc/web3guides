import {DOMAIN_COLLECTIBLES,type DomainId} from '../src/lib/chef/diner/domain-worlds';
import {DOMAIN_SEASONS,type DomainOpeningRecord,type DomainSeason} from '../src/lib/chef/diner/domain-seasons';
export const collectionWallet='0x'+(90).toString(16).padStart(40,'0');
const address=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
export const collectionSeasons:DomainSeason[]=DOMAIN_SEASONS.map((s,i)=>({...s,startsAt:1000,endsAt:100000,approved:true,contract:{chainId:1,address:address(i+1)},backingToken:{address:address(i+11),symbol:'TEST',decimals:18},protocolVersion:'test-only',feesApproved:true,fundingApproved:true}));
/** Synthetic indexed evidence for local tests only. Never sent to an account or chain. */
export function collectionEvidence(domain:DomainId){
 const season=collectionSeasons.find(s=>s.domain===domain)!,offset=collectionSeasons.indexOf(season)*100;
 const records:DomainOpeningRecord[]=DOMAIN_COLLECTIBLES.filter(i=>i.domain===domain).map((item,i)=>({id:`opening-${domain}-${i}`,domain,seasonId:season.id,catalogueVersion:3,pack:item.pack,itemId:item.id,opener:collectionWallet,chainId:1,contractAddress:season.contract!.address,transactionHash:hash(offset+i+1),logIndex:0,blockHash:hash(i+1000),blockNumber:i+1,tokenId:String(i+1),openedAt:2000+i,settlement:'finalized',source:'chain'}));
 return {domain,wallet:collectionWallet,records,seasons:collectionSeasons,serverNow:100000};
}

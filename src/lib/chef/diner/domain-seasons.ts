import {DOMAIN_CATALOGUE_VERSION,DOMAIN_COLLECTIBLE_BY_ID,DOMAIN_IDS,DOMAIN_PACK_MILESTONES,isDomainId,type DomainId} from './domain-worlds';
import type {PackKind} from './collectible-packs-v1';

export interface DomainSeason {
  id:string;domain:DomainId;catalogueVersion:typeof DOMAIN_CATALOGUE_VERSION;
  startsAt:number|null;endsAt:number|null;approved:boolean;
  contract:{chainId:number;address:string}|null;
  backingToken:{address:string;symbol:string;decimals:number}|null;
  protocolVersion:string|null;feesApproved:boolean;fundingApproved:boolean;
  prizes:{description:string;rulesUrl:string;funded:boolean;approved:boolean}|null;
}
/** Configuration is deliberately incomplete. A developer fixture is never a live season. */
export const DOMAIN_SEASONS:readonly DomainSeason[]=DOMAIN_IDS.map(domain=>({
  id:`${domain}-season-1`,domain,catalogueVersion:DOMAIN_CATALOGUE_VERSION,
  startsAt:null,endsAt:null,approved:false,contract:null,backingToken:null,protocolVersion:null,
  feesApproved:false,fundingApproved:false,prizes:null,
}));
const address=/^0x[0-9a-fA-F]{40}$/;
const nonzeroAddress=(value:string)=>address.test(value)&&!/^0x0{40}$/i.test(value);
export function validSeasonDates(season:DomainSeason):season is DomainSeason&{startsAt:number;endsAt:number}{return Number.isSafeInteger(season.startsAt)&&Number.isSafeInteger(season.endsAt)&&season.startsAt!>=0&&season.endsAt!>season.startsAt!;}
export function journeyEntryOpen(season:DomainSeason,serverNow:number){return season.approved&&validSeasonDates(season)&&Number.isSafeInteger(serverNow)&&serverNow>=season.startsAt&&serverNow<season.endsAt;}
export function journeyCanFinish(season:DomainSeason,startedAt:number,serverNow:number){return season.approved&&validSeasonDates(season)&&Number.isSafeInteger(startedAt)&&Number.isSafeInteger(serverNow)&&startedAt>=season.startsAt&&startedAt<season.endsAt&&serverNow>=startedAt&&serverNow<season.endsAt+24*60*60*1000;}
export function settlementConfigured(season:DomainSeason){
  return season.approved&&validSeasonDates(season)&&!!season.protocolVersion&&season.feesApproved&&season.fundingApproved&&!!season.contract&&Number.isSafeInteger(season.contract.chainId)&&season.contract.chainId>0&&nonzeroAddress(season.contract.address)&&!!season.backingToken&&nonzeroAddress(season.backingToken.address)&&!!season.backingToken.symbol&&Number.isInteger(season.backingToken.decimals)&&season.backingToken.decimals>=0&&season.backingToken.decimals<=36;
}
/** All three domains share one creative/settlement launch. Not exported as a client toggle. */
export function allDomainsConfigured(seasons:readonly DomainSeason[]){return DOMAIN_IDS.every(domain=>seasons.some(s=>s.domain===domain&&settlementConfigured(s)));}
export function visiblePrizes(season:DomainSeason){return season.approved&&season.prizes?.funded&&season.prizes.approved?season.prizes:null;}

/** Only the future server indexer may construct this from finalized canonical chain evidence.
 * Client requests, samples and local fixture draws must never be inserted as these records. */
export interface DomainOpeningRecord {
  id:string;domain:DomainId;seasonId:string;catalogueVersion:number;pack:PackKind;itemId:string;
  opener:string;chainId:number;contractAddress:string;transactionHash:string;logIndex:number;
  blockHash:string;blockNumber:number;tokenId:string;openedAt:number;
  settlement:'pending'|'finalized'|'refunded'|'invalid';source:'chain'|'fixture'|'sample';
}
const hash=/^0x[0-9a-fA-F]{64}$/;
export function canonicalDomainOpenings(records:readonly DomainOpeningRecord[],seasons:readonly DomainSeason[]){
  const wellFormed=records.filter(r=>r&&typeof r==='object'&&['id','domain','seasonId','pack','itemId','opener','contractAddress','transactionHash','blockHash','tokenId','settlement','source'].every(key=>typeof r[key as keyof DomainOpeningRecord]==='string'));
  const revoked=new Set<string>();for(const r of wellFormed)if(r.source==='chain'&&['refunded','invalid'].includes(r.settlement))revoked.add(`${r.chainId}:${r.transactionHash.toLowerCase()}:${r.logIndex}`);
  // Reject ambiguous identities wholesale. Input ordering cannot choose a winner.
  const candidates=wellFormed.filter(r=>{
    const s=seasons.find(s=>s.id===r.seasonId&&s.domain===r.domain),item=DOMAIN_COLLECTIBLE_BY_ID[r.itemId];
    return r.source==='chain'&&r.settlement==='finalized'&&!!s&&settlementConfigured(s)&&validSeasonDates(s)&&r.catalogueVersion===s.catalogueVersion&&item?.catalogueVersion===r.catalogueVersion&&item.domain===r.domain&&item.pack===r.pack&&isDomainId(r.domain)&&address.test(r.opener)&&r.chainId===s.contract!.chainId&&r.contractAddress.toLowerCase()===s.contract!.address.toLowerCase()&&hash.test(r.transactionHash)&&hash.test(r.blockHash)&&Number.isSafeInteger(r.blockNumber)&&r.blockNumber>=0&&Number.isSafeInteger(r.logIndex)&&r.logIndex>=0&&/^(0|[1-9][0-9]*)$/.test(r.tokenId)&&/^[a-zA-Z0-9:_-]{1,160}$/.test(r.id)&&Number.isSafeInteger(r.openedAt)&&r.openedAt>=s.startsAt&&r.openedAt<s.endsAt;
  });
  const unique=new Map<string,DomainOpeningRecord>(),conflicts=new Set<string>(),identities=new Map<string,string>();
  for(const r of candidates){
    if(revoked.has(`${r.chainId}:${r.transactionHash.toLowerCase()}:${r.logIndex}`))continue;
    const normalized={...r,opener:r.opener.toLowerCase(),contractAddress:r.contractAddress.toLowerCase(),transactionHash:r.transactionHash.toLowerCase(),blockHash:r.blockHash.toLowerCase()};
    const fingerprint=JSON.stringify([normalized.id,normalized.domain,normalized.seasonId,normalized.catalogueVersion,normalized.pack,normalized.itemId,normalized.opener,normalized.chainId,normalized.contractAddress,normalized.transactionHash,normalized.logIndex,normalized.blockHash,normalized.blockNumber,normalized.tokenId,normalized.openedAt]);
    const keys=[`id:${r.id}`,`event:${r.chainId}:${normalized.transactionHash}:${r.logIndex}`,`nft:${r.chainId}:${normalized.contractAddress}:${r.tokenId}`];
    for(const key of keys){const prior=identities.get(key);if(prior&&prior!==fingerprint){conflicts.add(prior);conflicts.add(fingerprint);}else identities.set(key,fingerprint);}
    unique.set(fingerprint,normalized);
  }
  return [...unique].filter(([f])=>!conflicts.has(f)).map(([,r])=>r);
}
export function domainLeaderboard(records:readonly DomainOpeningRecord[],seasons:readonly DomainSeason[],domain:DomainId,seasonId:string,pack:PackKind){
  const counts=new Map<string,number>();for(const r of canonicalDomainOpenings(records,seasons)){if(r.domain===domain&&r.seasonId===seasonId&&r.pack===pack)counts.set(r.opener,(counts.get(r.opener)??0)+1);}
  const entries=[...counts].map(([wallet,openings])=>({wallet,openings})).sort((a,b)=>b.openings-a.openings||a.wallet.localeCompare(b.wallet));
  let rank=0,last=-1;return entries.map((e,i)=>{if(e.openings!==last){rank=i+1;last=e.openings;}return {...e,rank};});
}
export function domainMilestoneEligibility(records:readonly DomainOpeningRecord[],seasons:readonly DomainSeason[],wallet:string,domain:DomainId){
  const openings=canonicalDomainOpenings(records,seasons).filter(r=>r.domain===domain&&r.opener===wallet.toLowerCase()).length;
  return DOMAIN_PACK_MILESTONES.filter(m=>openings>=m.openings).map(m=>({...m,receiptKey:`domain:${domain}:openings:${m.openings}`}));
}

export interface DomainNftAssignment {tokenKey:string;location:'home'|'truck';targetId:string;mode:'equipment'|'display'}
/** Reconcile a server-verified ownership snapshot. Removing a visual never removes a machine. */
export function reconcileDomainAssignments(assignments:readonly DomainNftAssignment[],ownedTokenKeys:ReadonlySet<string>){
  const used=new Set<string>(),targets=new Set<string>();return assignments.filter(a=>{const target=`${a.location}:${a.targetId}`;if(!ownedTokenKeys.has(a.tokenKey)||used.has(a.tokenKey)||targets.has(target))return false;used.add(a.tokenKey);targets.add(target);return true;});
}

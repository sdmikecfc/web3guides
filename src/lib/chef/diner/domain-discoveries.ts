import {DOMAIN_CATALOGUE_VERSION,DOMAIN_COLLECTIBLES,type DomainId} from './domain-worlds';
import {canonicalDomainOpenings,type DomainOpeningRecord,type DomainSeason} from './domain-seasons';

/** Versioned collection requirement. New catalogues must keep this definition for old rewards. */
export const DOMAIN_RESTAURANT_COLLECTION_VERSION=3 as const;
export const DOMAIN_COLLECTION_UNLOCK_COPY='Discover all 24 different collectibles for this domain across Regular and Super packs to unlock its complete restaurant. Each counts once, even after you sell, transfer or redeem it.';
export function domainCollectionProgress(records:readonly DomainOpeningRecord[],seasons:readonly DomainSeason[],wallet:string,domain:DomainId){
 const required=DOMAIN_COLLECTIBLES.filter(i=>i.domain===domain&&i.catalogueVersion===DOMAIN_RESTAURANT_COLLECTION_VERSION);
 const first=new Map<string,DomainOpeningRecord>();
 for(const opening of canonicalDomainOpenings(records,seasons)){
  if(opening.domain!==domain||opening.opener!==wallet.toLowerCase()||opening.catalogueVersion!==DOMAIN_RESTAURANT_COLLECTION_VERSION)continue;
  const prior=first.get(opening.itemId);if(!prior||opening.openedAt<prior.openedAt||(opening.openedAt===prior.openedAt&&opening.id<prior.id))first.set(opening.itemId,opening);
 }
 const discovered=required.filter(i=>first.has(i.id)),missing=required.filter(i=>!first.has(i.id));
 // An empty or accidentally shortened catalogue must never unlock a room.
 const complete=required.length===24&&missing.length===0&&DOMAIN_CATALOGUE_VERSION===DOMAIN_RESTAURANT_COLLECTION_VERSION;
 return {version:1 as const,domain,catalogueVersion:DOMAIN_RESTAURANT_COLLECTION_VERSION,total:24,found:discovered.length,
  discoveredIds:discovered.map(i=>i.id),missingIds:missing.map(i=>i.id),complete,
  packs:(['regular','super'] as const).map(pack=>({pack,found:discovered.filter(i=>i.pack===pack).length,total:12})),
  completedAt:complete?Math.max(...discovered.map(i=>first.get(i.id)!.openedAt)):null,
  receiptKey:`collection:${domain}:v${DOMAIN_RESTAURANT_COLLECTION_VERSION}:${wallet.toLowerCase()}`,
 };
}

// Discovery belongs to the opening history, not the current NFT balance. A genuine
// redemption does not refund/invalidate its opening. The indexer must retain that
// record after burn/transfer, while canonical reorg corrections remain excluded.

import assert from 'node:assert/strict';
import {DOMAIN_COLLECTIBLES,DOMAIN_IDS,DOMAIN_WORLDS,domainPackItems,domainItemAtTicket} from '../src/lib/chef/diner/domain-worlds';
import {DOMAIN_SEASONS,allDomainsConfigured,journeyEntryOpen,journeyCanFinish,settlementConfigured,visiblePrizes,canonicalDomainOpenings,domainLeaderboard,domainMilestoneEligibility,reconcileDomainAssignments,type DomainOpeningRecord,type DomainSeason} from '../src/lib/chef/diner/domain-seasons';
import {publicPacksEnabled,privatePackFixtureEnabled} from '../src/lib/chef/diner/pack-release';
import {ALL_COLLECTIBLES,collectibleAtTicket} from '../src/lib/chef/diner/collectible-packs';
let tests=0;function check(name:string,run:()=>void){run();tests++;console.log(`PASS ${name}`);}
check('72 unique concepts, six skins and three correctly composed benchmarks per domain',()=>{
  assert.equal(DOMAIN_COLLECTIBLES.length,72);assert.equal(new Set(DOMAIN_COLLECTIBLES.map(i=>i.id)).size,72);
  for(const domain of DOMAIN_IDS){const items=DOMAIN_COLLECTIBLES.filter(i=>i.domain===domain),heroes=items.filter(i=>i.hero);assert.equal(items.length,24);assert.equal(items.filter(i=>i.machine).length,6);assert.equal(heroes.length,3);assert(heroes.some(i=>i.rarity==='common'&&!i.machine));assert(heroes.some(i=>i.machine));assert(heroes.some(i=>['legendary','mythic'].includes(i.rarity)));assert.equal(DOMAIN_WORLDS[domain].menu.length,3);}
  assert(DOMAIN_COLLECTIBLES.every(i=>i.artStatus==='concept'));assert.equal(ALL_COLLECTIBLES.length,48);assert.equal(collectibleAtTicket('regular',0,1).id,'collect_lucky_bun');
});
check('all 60000 tickets match six exact distributions without changing legacy pools',()=>{
  for(const domain of DOMAIN_IDS)for(const pack of ['regular','super'] as const){const items=domainPackItems(domain,pack),counts=new Map<string,number>();assert.equal(items.length,12);assert.equal(items.reduce((n,i)=>n+i.weight,0),10000);for(let t=0;t<10000;t++){const item=domainItemAtTicket(domain,pack,t);counts.set(item.id,(counts.get(item.id)??0)+1);}for(const item of items)assert.equal(counts.get(item.id),item.weight);for(const invalid of [-1,10000,.4,NaN,Infinity])assert.throws(()=>domainItemAtTicket(domain,pack,invalid));}
});
const addr=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const seasons:DomainSeason[]=DOMAIN_SEASONS.map((s,i)=>({...s,startsAt:1000,endsAt:100000,approved:true,contract:{chainId:1,address:addr(i+1)},backingToken:{address:addr(i+11),symbol:'TEST',decimals:18},protocolVersion:'test-only',feesApproved:true,fundingApproved:true}));
function record(n:number,domain:'gochujang'|'smoothie'|'wines'='gochujang',pack:'regular'|'super'='regular',wallet=addr(90)):DomainOpeningRecord{const s=seasons.find(s=>s.domain===domain)!;return{id:`opening-${n}`,domain,seasonId:s.id,catalogueVersion:3,pack,itemId:domainPackItems(domain,pack)[0].id,opener:wallet,chainId:1,contractAddress:s.contract!.address,transactionHash:hash(n),logIndex:0,blockHash:hash(n+1000),blockNumber:n,tokenId:String(n),openedAt:2000,settlement:'finalized',source:'chain'};}
check('production stays closed even with release flags; incomplete configuration cannot launch',()=>{
  assert(!allDomainsConfigured(DOMAIN_SEASONS));assert(!allDomainsConfigured(seasons.slice(0,2)));assert(allDomainsConfigured(seasons));
  assert(!publicPacksEnabled({DINER_PACKS_RELEASE:'true',DINER_PACKS_FIXTURE:'true',NODE_ENV:'production'}));assert(!privatePackFixtureEnabled({NODE_ENV:'production',DINER_PACKS_FIXTURE:'true'}));
  for(const s of DOMAIN_SEASONS){assert(!settlementConfigured(s));assert(!journeyEntryOpen(s,2000));assert.equal(visiblePrizes(s),null);}
  assert(!settlementConfigured({...seasons[0],contract:{chainId:1,address:addr(0)}}));
});
check('season boundaries and 24-hour completion grace use server timestamps',()=>{
  const s=seasons[0];assert(!journeyEntryOpen(s,999));assert(journeyEntryOpen(s,1000));assert(!journeyEntryOpen(s,100000));assert(journeyCanFinish(s,99999,100000+86400000-1));assert(!journeyCanFinish(s,99999,100000+86400000));assert(!journeyCanFinish(s,100000,100001));assert(!journeyCanFinish(s,2000,1999));assert(!journeyCanFinish(s,NaN,2000));
});
check('six boards isolate domains/pack types, tie ranks and deduplicate all identities',()=>{
  const first=record(1),second=record(2,'gochujang','regular',addr(91)),records=[first,{...first},second,record(3,'gochujang','super'),record(4,'smoothie'),record(5,'wines')];
  assert.equal(canonicalDomainOpenings(records,seasons).length,5);const board=domainLeaderboard(records,seasons,'gochujang',seasons[0].id,'regular');assert.deepEqual(board.map(r=>[r.rank,r.openings]),[[1,1],[1,1]]);assert.equal(domainLeaderboard(records,seasons,'smoothie',seasons[1].id,'regular').length,1);
  const conflict={...first,id:'conflicting',opener:addr(92)};assert.equal(canonicalDomainOpenings([first,conflict],seasons).length,0);assert.equal(canonicalDomainOpenings([conflict,first],seasons).length,0);
});
check('invalid/refunded/pending/sample receipts and cross-domain items never count',()=>{
  const good=record(1);for(const patch of [{source:'fixture'},{source:'sample'},{settlement:'pending'},{settlement:'refunded'},{settlement:'invalid'},{catalogueVersion:2},{itemId:domainPackItems('wines','regular')[0].id},{openedAt:100000},{contractAddress:addr(777)},{opener:'not-wallet'}] as const)assert.equal(canonicalDomainOpenings([{...good,...patch} as DomainOpeningRecord],seasons).length,0);
  assert.equal(canonicalDomainOpenings([good,{...good,settlement:'refunded'}],seasons).length,0);
  assert.deepEqual(canonicalDomainOpenings([null,{}, {...good,contractAddress:42}] as unknown as DomainOpeningRecord[],seasons),[]);
});
check('combined opening milestones and verified ownership reconciliation preserve exclusivity',()=>{
  const records=Array.from({length:50},(_,i)=>record(i+1,'gochujang',i%2?'super':'regular'));
  assert.deepEqual(domainMilestoneEligibility(records,seasons,addr(90),'gochujang').map(m=>m.openings),[1,10,50]);assert.deepEqual(domainMilestoneEligibility(records,seasons,addr(90),'wines'),[]);
  const assignments=[{tokenKey:'a',location:'home' as const,targetId:'counter',mode:'display' as const},{tokenKey:'a',location:'truck' as const,targetId:'machine',mode:'equipment' as const},{tokenKey:'b',location:'home' as const,targetId:'counter',mode:'display' as const},{tokenKey:'sold',location:'home' as const,targetId:'sold-display',mode:'display' as const}];
  assert.deepEqual(reconcileDomainAssignments(assignments,new Set(['a','b'])),[assignments[0]]);
});
console.log(`${tests} domain foundation checks passed. Chain integration, art approval and journeys are separate gates.`);

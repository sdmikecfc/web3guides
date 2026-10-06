import assert from 'node:assert/strict';
import {domainCollectionProgress} from '../src/lib/chef/diner/domain-discoveries';
import {grantDomainRoomKit} from '../src/lib/chef/diner/domain-room-kits';
import {reconcileDomainAssignments} from '../src/lib/chef/diner/domain-seasons';
import {createDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import {collectionEvidence} from './dk-domain-collection-fixture';
for(const domain of ['gochujang','smoothie','wines'] as const){
 const e=collectionEvidence(domain),progress=(records=e.records,wallet=e.wallet)=>domainCollectionProgress(records,e.seasons,wallet,domain);
 assert.equal(progress().complete,true);assert.equal(progress().found,24);assert.deepEqual(progress().packs.map(p=>p.found),[12,12]);
 assert.equal(progress(e.records.slice(0,23)).complete,false);
 assert.equal(progress([...e.records.slice(0,23),e.records[0],e.records[0]]).found,23);
 assert.equal(progress([...e.records.slice(0,23),{...e.records[23],pack:e.records[0].pack,itemId:e.records[0].itemId}]).found,23,'Different openings of the same item still only count once');
 const other=collectionEvidence(domain==='wines'?'gochujang':'wines');
 assert.equal(progress(other.records).found,0,'Another domain cannot fill collection slots');
 assert.equal(progress([...e.records,...other.records]).found,24,'Combined account history stays separated by domain');
 assert.equal(progress(e.records.filter(r=>r.pack==='regular')).found,12);
 assert.equal(progress(e.records,'0x'+'f'.repeat(40)).found,0);
 assert.equal(progress(e.records.map(r=>({...r,source:'sample'}))).found,0);
 assert.equal(progress(e.records.map(r=>({...r,settlement:'pending'}))).found,0);
 assert.equal(progress([...e.records,{...e.records[0],settlement:'invalid'}]).found,23);
 assert.equal(progress([...e.records,{...e.records[0],settlement:'refunded'}]).found,23);
 assert.equal(progress(e.records.map(r=>({...r,catalogueVersion:2}))).found,0);
 // Selling/redemption removes the current visual, never the retained opening evidence.
 assert.deepEqual(reconcileDomainAssignments([{tokenKey:'sold',location:'home',targetId:'counter',mode:'display'}],new Set()),[]);
 assert.equal(progress(JSON.parse(JSON.stringify(e.records))).complete,true);
 const state=createDiner(1800000000000,'collection-test');
 assert.throws(()=>grantDomainRoomKit(state,{...e,records:e.records.slice(0,23)}),/24 different/);
 assert.throws(()=>grantDomainRoomKit(state,{...e,serverNow:2000}),/24 different/);
 assert.throws(()=>grantDomainRoomKit(state,{source:'verified-journey',verifiedServices:8} as never),/history/);
 const earned=grantDomainRoomKit(state,e);assert.ok(sanitizeDinerSave(earned));
 assert.equal(earned.domainRooms!.earned[domain]!.earnedAt,2023);
 assert.deepEqual(grantDomainRoomKit(earned,e),earned);
 const sold=structuredClone(earned);sold.decorOwned[`domain_kit_${domain}_plant`]=0;
 assert.equal(grantDomainRoomKit(sold,e).decorOwned[`domain_kit_${domain}_plant`],0);
 // Previously earned rooms survive the change in requirement and account refreshes.
 assert.deepEqual(grantDomainRoomKit(earned,{...e,records:[]}),earned);
 const nextSeason={...e.seasons.find(s=>s.domain===domain)!,id:`${domain}-season-2`,startsAt:100000,endsAt:200000};
 const split=e.records.map((r,i)=>i<12?r:{...r,seasonId:nextSeason.id,openedAt:100001+i});
 assert.equal(domainCollectionProgress(split,[...e.seasons,nextSeason],e.wallet,domain).complete,true);
 console.log(`PASS ${domain}: 24 unique discoveries, duplicates, history, seasons, invalid evidence, room entitlement and retry`);
}

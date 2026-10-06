import assert from 'node:assert/strict';
import {DOMAIN_IDS,domainPackItems} from '../src/lib/chef/diner/domain-worlds';
import {DOMAIN_ODDS_V2,experiencePackItems,experienceItemAtTicket,emptyPackPreview,beginPackPreview,finishPackPreview,restorePackPreview,previewDiscoveries,RARITY_PRESENTATION,revealPhase,CINEMATIC_SPEED,cinematicRevealPhase} from '../src/lib/chef/diner/pack-experience';
import {canonicalDomainOpenings,DOMAIN_SEASONS,type DomainOpeningRecord} from '../src/lib/chef/diner/domain-seasons';
let checks=0;function check(label:string,run:()=>void){run();checks++;console.log(`PASS ${label}`);}
check('every ticket follows the new base odds, with immutable legacy probabilities',()=>{
 for(const domain of DOMAIN_IDS)for(const pack of ['regular','super'] as const){
  const items=experiencePackItems(domain,pack),counts=new Map<string,number>();assert.equal(items.reduce((s,i)=>s+i.weight,0),10000);
  for(let t=0;t<10000;t++){const i=experienceItemAtTicket(domain,pack,t);counts.set(i.id,(counts.get(i.id)??0)+1);}
  for(const i of items)assert.equal(counts.get(i.id),DOMAIN_ODDS_V2[i.rarity]);
  assert.equal(domainPackItems(domain,pack).find(i=>i.rarity==='mythic')!.weight,1);
 }
 for(const bad of [-1,10000,NaN,.5,Infinity])assert.throws(()=>experienceItemAtTicket('wines','regular',bad));
});
check('pending preview freezes before animation; skips, replays and reloads never duplicate it',()=>{
 let s=beginPackPreview(emptyPackPreview(),'gochujang','regular');assert(s.pending);const original=s.pending;
 assert.equal(beginPackPreview(s,'wines','super'),s);
 s=restorePackPreview(JSON.stringify(s));assert.deepEqual(s.pending,original);
 s=finishPackPreview(s);assert.equal(s.openings.length,1);assert.equal(finishPackPreview(s),s);
 const again=finishPackPreview({...s,pending:original});assert.equal(again.openings.length,1);
 for(let n=0;n<18;n++)s=finishPackPreview(beginPackPreview(s,'gochujang','regular'));
 assert(previewDiscoveries(s,'gochujang').size<19);assert.equal(previewDiscoveries(s,'wines').size,0);
 assert.deepEqual(canonicalDomainOpenings(s.openings as unknown as DomainOpeningRecord[],DOMAIN_SEASONS),[]);
});
check('storage rejects malformed previews, bad identities, excessive data and unbuilt items',()=>{
 for(const bad of [null,'{','{}','x'.repeat(100001),JSON.stringify({version:8,openings:[]})])assert.deepEqual(restorePackPreview(bad),emptyPackPreview());
 const s=beginPackPreview(emptyPackPreview(),'wines','super'),r=s.pending!;
 for(const patch of [{source:'chain'},{domain:'fake'},{pack:'paid'},{sequence:-1},{id:'elsewhere'},{itemId:'unknown'}])assert.equal(restorePackPreview(JSON.stringify({...s,pending:{...r,...patch}})).pending,null);
 const saved=restorePackPreview(JSON.stringify({version:1,openings:[r,r],pending:null}));assert.equal(saved.openings.length,1);
});
check('hints use actual rarity; reduced motion goes directly to the same result',()=>{
 for(const rarity of Object.keys(RARITY_PRESENTATION) as (keyof typeof RARITY_PRESENTATION)[]){
  const timing=RARITY_PRESENTATION[rarity];assert.equal(revealPhase(0,rarity),'arrival');assert.equal(revealPhase(900,rarity),'hint');assert.equal(revealPhase(2000,rarity),'unseal');assert.equal(revealPhase(timing.duration,rarity),'revealed');assert.equal(revealPhase(0,rarity,true),'revealed');assert(timing.duration<=5500);
 }
});
check('cinematic cues follow media progress without granting or replacing a draw',()=>{
 assert.equal(cinematicRevealPhase(0),'arrival');assert.equal(cinematicRevealPhase(.3),'hint');assert.equal(cinematicRevealPhase(.75),'unseal');
 // Only media end (or explicit skip/fallback) completes the existing frozen receipt.
 assert.equal(cinematicRevealPhase(1),'unseal');
 for(const speed of Object.values(CINEMATIC_SPEED))assert(speed>=.8&&speed<=1);
 const pending=beginPackPreview(emptyPackPreview(),'gochujang','regular');
 for(let replay=0;replay<3;replay++)for(const progress of [0,.3,.8,1])cinematicRevealPhase(progress);
 assert.equal(pending.openings.length,0);assert.equal(finishPackPreview(pending).openings.length,1);
});
// Exact nonuniform coupon-collector mean, plus reproducible independent draws.
function expected(p:number[]){let total=0;for(let mask=1;mask<1<<p.length;mask++){let sum=0,bits=0;for(let i=0;i<p.length;i++)if(mask&(1<<i)){sum+=p[i];bits++;}total+=(bits%2?1:-1)/sum;}return total;}
const weights=experiencePackItems('gochujang','regular').map(i=>i.weight),thresholds=weights.map((_,i)=>weights.slice(0,i+1).reduce((a,b)=>a+b,0));
let seed=0x51fa22;function uniform(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function complete(){let mask=0,n=0;while(mask!==4095){const t=uniform()*10000;mask|=1<<thresholds.findIndex(x=>t<x);n++;}return n;}
const trials=100000,one:number[]=[],full:number[]=[];for(let n=0;n<trials;n++){const a=complete(),b=complete();one.push(a);full.push(a+b);}one.sort((a,b)=>a-b);full.sort((a,b)=>a-b);
const stats=(a:number[])=>({median:a[Math.floor(a.length*.5)],p90:a[Math.floor(a.length*.9)],p95:a[Math.floor(a.length*.95)],mean:Number((a.reduce((x,y)=>x+y,0)/a.length).toFixed(2))});
console.log(JSON.stringify({trials,seed:'0x51fa22',exactMeanPerPack:Number(expected(weights.map(w=>w/10000)).toFixed(2)),legacyExactMeanPerPack:Number(expected(domainPackItems('gochujang','regular').map(i=>i.weight/10000)).toFixed(2)),one12ItemPack:stats(one),full24ItemSet:stats(full),assumption:'Independent draws. Switch away from a completed pack type. No maximum or guarantee.'},null,2));
console.log(`${checks} pack experience checks passed.`);

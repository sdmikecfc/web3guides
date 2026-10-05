const assert=require('node:assert/strict');
const {freshWorkshop,changeWorkshop}=require('../../src/lib/bots/workshop8/state');
const {preset,defaultAppearance}=require('../../src/lib/bots/workshop8/catalogue');
const {playerAction,applyBrowserStarter}=require('../../src/lib/bots/workshop8/server-contract');
const {simulateWorkshopFight,WORKSHOP_RULES}=require('../../src/app/bots/_server/workshop8-simulation');
async function main(){
 for(const kind of ['complete','checkpoint','start','special'])assert.throws(()=>playerAction({kind,winner:0,coins:1e9},'test-request'));
 assert.throws(()=>playerAction({kind:'choose',slot:'torso',entry:'made-up'},'test-request'));
 const {decodeBanner}=require('../../src/lib/bots/workshop8/banner-storage');
 await assert.rejects(()=>decodeBanner(new Blob(['bad'],{type:'image/svg+xml'})),/PNG, JPEG or WebP/);
 await assert.rejects(()=>decodeBanner(new Blob(['bad'],{type:'image/png'})),/not a supported/);
 await assert.rejects(()=>decodeBanner(new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'})),/smaller than 5 MB/);
 const oversizedPng=new Uint8Array(25);oversizedPng.set([137,80,78,71,13,10,26,10]);const header=new DataView(oversizedPng.buffer);header.setUint32(16,5000);header.setUint32(20,5000);
 await assert.rejects(()=>decodeBanner(new Blob([oversizedPng],{type:'image/png'})),/16 million/);
 const initial=freshWorkshop(),draft={name:'My starter',choices:preset('tank'),appearance:defaultAppearance()};
 const transferred=applyBrowserStarter(initial,draft,true,'transfer-test-1',1000);assert.equal(transferred.coins,0);assert.equal(transferred.robots.length,1);assert.equal(transferred.revision,1);assert.deepEqual(transferred.robots[0].choices,draft.choices);
 assert.throws(()=>applyBrowserStarter(transferred,draft,true,'another-id',2000));assert.throws(()=>applyBrowserStarter(initial,{...draft,choices:preset('tank',4)},true,'tier-test',2000));
 const fight={id:'fixture-fight',robotId:null,name:'Test',choices:preset('tank'),appearance:defaultAppearance(),rival:preset('speed'),seed:75,arena:'spaceship',startedAt:1000,versions:WORKSHOP_RULES,inputs:[]};
 // Regression: server GLBs use front faces, while browser render materials are double-sided.
 const contactFight={...fight,seed:1341344613,choices:preset('speed'),rival:preset('tank'),mode:'training',versions:{...WORKSHOP_RULES,training:'mk8-training-1'}};
 const canonical=await simulateWorkshopFight(contactFight,7200),browserSides=await simulateWorkshopFight(contactFight,0);
 const THREE=require('three');
 for(const actor of browserSides.actors)for(const proxy of actor.proxies)for(const surface of proxy.surfaces??[]){const m=surface.collision.material;surface.collision.material=Array.isArray(m)?m.map(x=>x.clone()):m.clone();for(const material of Array.isArray(surface.collision.material)?surface.collision.material:[surface.collision.material])material.side=THREE.DoubleSide;}
 browserSides.replayCommands=canonical.inputs;while(browserSides.tick<canonical.tick&&!browserSides.done)browserSides.step();
 assert.equal(canonical.tick,1147);assert.equal(canonical.winner,1);assert.equal(canonical.actors[0].hp.torso,0);
 assert.ok(browserSides.actors[0].hp.torso>70,'Regression fixture must reproduce the old browser divergence');
 const {pinServerContact}=require('../../art-src/bots/personal-v8/server-contact');
 const repaired=await simulateWorkshopFight(contactFight,0);
 for(const actor of repaired.actors)for(const proxy of actor.proxies)for(const surface of proxy.surfaces??[]){const m=surface.collision.material;surface.collision.material=Array.isArray(m)?m.map(x=>x.clone()):m.clone();for(const material of Array.isArray(surface.collision.material)?surface.collision.material:[surface.collision.material])material.side=THREE.DoubleSide;}
 const releaseContact=pinServerContact(repaired);repaired.replayCommands=canonical.inputs;
 // Render frame batching must not change contacts, damage anchors or results.
 for(const batch of [1,2,4]){const replay=await simulateWorkshopFight(contactFight,0),dispose=pinServerContact(replay);replay.replayCommands=canonical.inputs;while(!replay.done){for(let n=0;n<batch&&!replay.done;n++)replay.step();}assert.deepEqual(replay.events,canonical.events);assert.equal(replay.tick,canonical.tick);dispose();}
 while(!repaired.done)repaired.step();assert.deepEqual(repaired.events,canonical.events);assert.equal(repaired.tick,canonical.tick);releaseContact();
 console.log('Browser/server outer-face contact regression passed at 1147 ticks; 30/60/120 presentation batches agree.');
 const start=Date.now(),a=await simulateWorkshopFight(fight,7200),b=await simulateWorkshopFight(fight,a.tick);assert.equal(a.done,true);assert.deepEqual(a.snapshot(),b.snapshot());
 require('node:fs').writeFileSync(require('node:path').join(process.env.TEMP||'D:/Temp','modelkombat-authority-fixture.json'),JSON.stringify({fight,snapshot:a.snapshot()}));
 const {TRAINING_VERSION}=require('../../src/lib/bots/workshop8/training');
 const {explainFight,recordCareer,plannedParts}=require('../../src/lib/bots/workshop8/journey');
 const training={...fight,mode:'training',robotId:transferred.robots[0].id,versions:{...WORKSHOP_RULES,training:TRAINING_VERSION}};
 const ready=await simulateWorkshopFight(training,1);assert.equal(ready.actors[0].meter,100);assert.equal(ready.special(0,'accepted-1'),true);
 const trained=await simulateWorkshopFight({...training,inputs:[{id:'accepted-1',who:0,tick:2}]},7200);
 assert.ok(trained.inputs.some(i=>i.id==='accepted-1'));assert.ok(!trained.events.some(e=>e.who===1&&e.kind==='prepare'&&e.tick<300));
 const recordedPlayback=await simulateWorkshopFight(training,0);recordedPlayback.replayCommands=trained.inputs;while(!recordedPlayback.done)recordedPlayback.step();assert.deepEqual(recordedPlayback.events,trained.events,'Full recorded-input playback must match automatic defender decisions');
 const legacy=await simulateWorkshopFight({...fight,versions:{...WORKSHOP_RULES,events:undefined}},7200);
 const strip=e=>{const {eventVersion,actionInstance,targetActionInstance,mitigation,...old}=e;return old};assert.deepEqual(a.events.map(strip),legacy.events);assert.equal(a.tick,795);assert.equal(a.winner,0);
 assert.ok(a.events.filter(e=>e.kind==='hit').every(e=>e.eventVersion===2&&e.mitigation));
 let started=changeWorkshop(transferred,{kind:'start',fight:training},1000),settled=changeWorkshop(started,{kind:'complete',id:training.id,winner:trained.winner,ticks:trained.tick,inputs:trained.inputs,reason:'Training',versions:training.versions},10000);
 const report=explainFight(settled.history[0],trained.events,trained.actors.map(a=>a.initial));recordCareer(settled,settled.history[0],report,trained.events);
 assert.equal(settled.coins,75);assert.equal(settled.robots[0].wins,0);assert.equal(settled.robots[0].losses,0);assert.equal(settled.robots[0].repairUntil,0);assert.deepEqual(report.milestones,['ring_ready']);assert.ok(settled.journey.retained[training.id]);
 // Cosmetics cannot mint achievements or change equipment; retained packets survive history rollover.
 const robotId=settled.robots[0].id;
 assert.throws(()=>changeWorkshop(settled,playerAction({kind:'career',id:robotId,emblem:'bolt'},'locked-emblem'),10000),/Earn this emblem/);
 let decorated=changeWorkshop(settled,playerAction({kind:'career',id:robotId,emblem:'spark',pose:'salute',pin:training.id},'earned-emblem'),10000);
 assert.deepEqual(decorated.robots[0].choices,settled.robots[0].choices);assert.equal(decorated.coins,settled.coins);
 decorated.history=[];assert.ok(decorated.journey.retained[training.id]);
 assert.equal(decorated.robots[0].career.emblem,'spark');
 const earlierAppearance=JSON.stringify(decorated.journey.retained[training.id].appearance);
 const painted=changeWorkshop(decorated,{kind:'paint',id:robotId,name:'New paint',appearance:defaultAppearance('hunter')},10000);
 assert.equal(JSON.stringify(painted.journey.retained[training.id].appearance),earlierAppearance);
 assert.notDeepEqual(painted.robots[0].appearance,decorated.robots[0].appearance);
 assert.equal(plannedParts({...initial,journey:{plan:draft},spares:[{uid:'one',item:require('../../src/lib/bots/workshop8/catalogue').itemId(draft.choices.armL,'armL')}]}).cost,225);
 const synthetic={...fight,robotId:transferred.robots[0].id,winner:0,ticks:1800};
 const moments=explainFight(synthetic,[{id:1,tick:100,kind:'hit',who:1,target:0,slot:'torso',amount:80},{id:2,tick:200,kind:'break',who:1,target:0,slot:'armR'},{id:3,tick:1790,kind:'defeat',who:1}],[{torso:100},{torso:100}]);
 assert.ok(moments.milestones.includes('comeback'));assert.ok(moments.milestones.includes('last_arm'));assert.equal(moments.highlight.end-moments.highlight.start,1200);
 console.log(JSON.stringify({passed:true,ticks:a.tick,winner:a.winner,events:a.events.length,seconds:(Date.now()-start)/1000,checks:['client result rejection','starter transfer validation','no imported currency','exact geometry simulation','deterministic reconstruction','accepted special','training opening and one reward','unchanged legacy events','separate spare copies','cosmetic entitlement','paint isolation','retained career replay','recorded comeback and limb milestones','invalid and oversized banner rejection']}));
}
main().catch(e=>{console.error(e);process.exitCode=1});

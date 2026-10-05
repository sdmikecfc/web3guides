const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFightV6,presetV6,stepFightV6,acceptSpecialV6,advanceFightV6,resultV6}=require('../src/lib/bots/v6');
const {acceptsSeasonSnapshot,advanceSeasonPicture,seasonMoment,seasonPayoutText}=require('../src/lib/bots/season/live-playback');
const copy=structuredClone,checks=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};
let ready;
for(let seed=1;seed<=64&&!ready;seed++){
 const s=createFightV6(seed,presetV6('tank',3),presetV6('tank',3));
 while(!s.done){if(s.fighters[0].meter>=100){const candidate=copy(s);if(acceptSpecialV6(candidate,{id:'probe',who:0,kind:'special',frame:s.frame}).accepted){ready=copy(s);break;}}stepFightV6(s);}
}
assert(ready,'real engine reaches manual Special opportunity');
const bare=(s,revision)=>({id:'fight-a',revision,tick:s.frame,state:copy(s),status:s.done?'complete':'running'});
const before=bare(ready,10),accepted=copy(ready);
assert(acceptSpecialV6(accepted,{id:'saved-special',who:0,kind:'special',frame:accepted.frame}).accepted);
const after=bare(accepted,11);
assert(!acceptsSeasonSnapshot(after,before,'fight-a'));
assert(acceptsSeasonSnapshot(before,after,'fight-a'));
assert(!acceptsSeasonSnapshot(after,{...after,id:'fight-b'},'fight-a'));
assert(acceptsSeasonSnapshot(null,{...after,id:'fight-b'},'fight-b'));
assert(!acceptsSeasonSnapshot(after,{...after,tick:after.tick+1},'fight-a'));
pass('same-frame lower revision, wrong-session and inconsistent-clock replies are rejected; new session initializes independently');
const picture=copy(ready);advanceSeasonPicture(picture,accepted,0);assert.deepEqual(picture,accepted);
advanceSeasonPicture(picture,accepted,180);assert.deepEqual(picture,accepted);
pass('accepted command at the current tick applies once without predicting even one unconfirmed tick');
const complete=copy(accepted);advanceFightV6(complete,5400);
let iterations=0;
while(!picture.done){const from=picture.frame;advanceSeasonPicture(picture,complete,120);assert(picture.frame<=complete.frame);assert(picture.frame-from<=120);assert(++iterations<100);}
assert.equal(resultV6(picture).hash,resultV6(complete).hash);
pass('bounded confirmed playback reproduces exact saved result, damage events and manual Special history');
assert.throws(()=>advanceSeasonPicture(picture,ready,100),/beyond/);
assert.equal(seasonMoment({kind:'break',who:1,target:0,slot:'armL'},1),'Your robot lost an arm.');
assert.equal(seasonMoment({kind:'knockdown',who:0,target:1},1),'The rival knocked your robot down.');
assert.equal(seasonMoment({kind:'block',who:0,target:1,absorbed:12},1),'Your robot blocked 12 damage.');
pass('defender-side knockdown, block and limb-loss language follows recorded event ownership');
const payout={...after,settlement:{playCoins:75,objectiveCoins:0,tradeBonus:-100}};
assert.equal(seasonPayoutText(payout),'-25 season coins (includes a corrected trade bonus)');
assert.equal(seasonPayoutText({...payout,viewerSide:1}),'Recorded defense. No coins were won or lost.');
assert.equal(seasonPayoutText({...payout,settlement:null}),'Saving the result…');
pass('pending settlement, negative correction and defender result never claim an invented payout');
const output={checks,fixture:{seed:ready.seed,readyFrame:ready.frame,endFrame:complete.frame,hash:resultV6(complete).hash},scope:'offline pure real v6 engine; no services'};
fs.writeFileSync(path.join(process.env.BOTS_SEASON_STAGE||path.resolve(__dirname,'..'),'playback-verification.json'),JSON.stringify(output,null,2));

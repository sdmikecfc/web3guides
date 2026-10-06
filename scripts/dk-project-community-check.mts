import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDiner,dispatchDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import {createRestaurantBlueprint} from '../src/lib/chef/diner/room-plan';
import {applyProjectCommand,projectProgress,validRestaurantProjects} from '../src/lib/chef/diner/restaurant-projects';
import {decorationDiscoveries} from '../src/lib/chef/diner/decor-discoveries';
import {newPersonalTouches} from '../src/lib/chef/diner/personal-touches';
import {createCommunityAttempt,replayCommunity,communityMealIds,arrangeCommunity,picnicService} from '../src/lib/chef/diner/community-feast';
import {validateRankedEnvelope,type RankedCommand} from '../src/lib/chef/diner/ranked-rally';
import {Cook} from './dk-diner-cook-fixture';
import {RECIPE_BY_ID} from '../src/lib/chef/diner/content';
import {nextIntroduction,introductionVisit} from '../src/lib/chef/diner/introductions';
const now=1800000000000,wallet='0x1111111111111111111111111111111111111111';
for(const [id,pair] of [['burger',['classic_burger','fries']],['breakfast',['pancakes','coffee']],['ramen',['vegetable_ramen','spicy_miso_ramen']],['bistro',['classic_burger','apple_pie']]] as const){
 const s=createDiner(now,`project-${id}`),blueprint=createRestaurantBlueprint('restaurant');s.home={...s.home,...blueprint,w:14,h:12,name:'Our little kitchen'};s.personal=newPersonalTouches();s.equipment.table_2={tier:1,truckOwned:true,homeCopies:3};
 for(const recipe of pair){assert(RECIPE_BY_ID[recipe],recipe);s.recipes[recipe]={level:3};s.career.servedRecipes[recipe]=10;}
 s.personal.signature={version:1,recipeId:pair[0],name:'Our favourite',style:'sage'};
 const machines=[...new Set(pair.flatMap(recipe=>RECIPE_BY_ID[recipe].steps.map(s=>s.station)))];s.home.layout=s.home.layout.filter(p=>p.equipmentId.startsWith('table_'));machines.push('sink');
 machines.forEach((machine,i)=>{s.equipment[machine]={tier:1,truckOwned:true,homeCopies:1};s.home.layout.push({id:`home-${machine}`,equipmentId:machine,x:i*2,y:0,rotation:0});});
 for(const [i,decor] of ['retro_radio','burger_mascot','welcome_mat'].entries()){s.decorOwned[decor]=1;s.home.layout.push({id:`decor-${i}`,equipmentId:decor,x:2+i*2,y:10,rotation:0});}
 applyProjectCommand(s,{type:'selectProject',id,pair:[...pair]},now);applyProjectCommand(s,{type:'confirmProjectDesign'},now);assert(projectProgress(s)?.ready);
 const before=structuredClone({coins:s.coins,pantry:s.pantry,career:s.career,collections:s.collections,home:s.home});applyProjectCommand(s,{type:'startOpening'},now);
 const project=s.projects!.entries[id]!,opening=project.opening!;assert(opening);let ms=now,guard=0;
 while(opening.world.metrics.plates<6&&guard++<16000){ms+=250;applyProjectCommand(s,{type:'openingInput',action:{type:'tick',ticks:5}},ms);for(let guest=0;guest<Math.min(3,opening.world.metrics.arrivals);guest++)if(!opening.greeted.includes(guest))applyProjectCommand(s,{type:'openingInput',action:{type:'greet',guest}},ms);}
 assert.equal(opening.world.metrics.plates,6,`${id}: ${JSON.stringify(opening.world.metrics)}`);assert(validRestaurantProjects(s.projects!));
 applyProjectCommand(s,{type:'completeProject'},ms);assert.equal(s.decorOwned[`prestige_project_${id}`],1);assert.deepEqual({coins:s.coins,pantry:s.pantry,career:s.career,collections:s.collections,home:s.home},before);
 const original=JSON.stringify(s.projects!.entries[id]);applyProjectCommand(s,{type:'selectProject',id,pair:[...pair]},ms);assert.equal(JSON.stringify(s.projects!.entries[id]),original);
 console.log(`PASS ${id}: six real meals, three greetings, one plaque, preserved production and progress.`);
}
{
 const s=createDiner(now,'pairs'),before=structuredClone(s);s.home.layout.push({id:'radio',equipmentId:'retro_radio',x:4,y:5,rotation:0},{id:'mascot',equipmentId:'burger_mascot',x:5,y:5,rotation:0});assert(decorationDiscoveries(s.home).some(d=>d.id==='radio_mascot'));assert.equal(before.personal?.discoveries.length??0,0);s.home.layout.find(p=>p.id==='mascot')!.x=8;assert(!decorationDiscoveries(s.home).some(d=>d.id==='radio_mascot'));
 s.career.services=5;const intro=nextIntroduction(s)!;assert.equal(intro.id,'crew');s.personal={...newPersonalTouches(),introductions:[intro.id],lastSuggestionVisit:introductionVisit(s)};assert.equal(nextIntroduction(s,true),null);s.progressRewards!.pinned='burger_upgrade';s.personal.lastSuggestionVisit=null;assert.equal(nextIntroduction(s,true),null);
 const claimant=createDiner(now,'claimant');assert(dispatchDiner(claimant,{type:'claimCommunityPlaque'},{now}).error);const r=dispatchDiner(claimant,{type:'claimCommunityPlaque'},{now,verifiedCommunityPlaque:true});assert(!r.error,r.error);assert.equal(dispatchDiner(r.state,{type:'claimCommunityPlaque'},{now,verifiedCommunityPlaque:true}).state.decorOwned.prestige_picnic_plaque,1);
 console.log('PASS pair distance, preview isolation, single introduction, pinned goal and verified once-only plaque.');
}
let a=createCommunityAttempt(randomUUID(),wallet,now),ms=now;
const envelope=(commands:RankedCommand[])=>({id:randomUUID(),attemptId:a.id,revision:a.revision,commands});
function send(c:RankedCommand){if(c.type==='service'&&c.action.type==='tick')ms+=c.action.ticks*50;a=replayCommunity(a,envelope([c]),ms).attempt;}
assert.equal(a.service.cleanPlates,4);assert.equal(a.service.tables.length,1);assert.equal(a.service.tables[0].capacity,2);assert(a.service.stations.every(s=>s.tier===1));assert.equal(a.service.config.signature,undefined);
assert.throws(()=>validateRankedEnvelope({...envelope([{type:'finish'}]),meals:300}));
send({type:'service',action:{type:'prepare'}});assert.throws(()=>replayCommunity(a,envelope([{type:'service',action:{type:'tick',ticks:100}}]),ms));
const interrupted=replayCommunity(a,envelope([{type:'service',action:{type:'tick',ticks:1}}]),ms+6000);assert(interrupted.interrupted);assert.equal(interrupted.attempt.service.phase,'paused');
a=createCommunityAttempt(randomUUID(),wallet,now);ms=now;const cook=new Cook(()=>a.service,action=>send({type:'service',action}));cook.run();send({type:'finish'});assert.equal(communityMealIds(a).length,6);assert.equal(new Set(communityMealIds(a)).size,6);assert.equal(a.status,'complete');
assert.throws(()=>replayCommunity(a,envelope([{type:'finish'}]),ms));
console.log('PASS canonical picnic gear, physical burger/fries service, six meal IDs, forged totals, accelerated time and interruption.');

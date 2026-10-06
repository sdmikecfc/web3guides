import assert from 'node:assert/strict';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {createFoodModel,createModel,animateCharacter}=await sourceModule('src/app/chef/diner-preview/models.ts');
const {sceneFoodKey}=await sourceModule('src/app/chef/diner-preview/scene-types.ts');
const patty={recipeId:'classic_burger',kind:'processed',stage:'cooked_patty'};
const joined={...patty,components:[{id:'bun-1',ingredientId:'bun'}]};
const before=JSON.stringify(joined);
assert.notEqual(sceneFoodKey(patty),sceneFoodKey(joined),'Adding a bun invalidates the scene model');
const plain=createFoodModel(patty),assembly=createFoodModel(joined);
assert.equal(plain.getObjectByName('assembly:bun'),undefined);
const bun=assembly.getObjectByName('assembly:bun');assert.ok(bun,'Actual added bun is visible');
const bounds=new THREE.Box3().setFromObject(assembly),bunBounds=new THREE.Box3().setFromObject(bun);
assert.ok(bunBounds.max.y>.16&&bunBounds.min.y>=0,'Bun stands above the board');
assert.ok(bounds.max.x-bounds.min.x<.85,'Food fits one prep working surface');
assert.ok(!createFoodModel({...joined,stage:'prepared_classic_burger'}).getObjectByName('assembly:bun'),'Finished burger has no duplicate bun');
assert.equal(JSON.stringify(joined),before,'Presentation cannot mutate ingredient ownership');
console.log('PASS real bun geometry, component cache invalidation, footprint and finished-food conservation');
const person=createModel('customer'),rig=person.userData.rig;
for(let i=0;i<30;i++)animateCharacter(person,i/60,'walk',false,true,undefined,{delta:1/60,speed:1});
assert.equal(person.userData.characterMotion.key,'walk');
animateCharacter(person,.5,'walk',false,false,undefined,{delta:1/60,speed:0});
assert.equal(person.userData.characterMotion.key,'idle','A blocked walk intent is not a walking animation');
for(const seatHeight of [.48,.58,.707])for(const pose of ['sit','eat'])for(const carry of [false,true]){
 animateCharacter(person,1,pose,carry,true,{seatHeight},{delta:1/60,speed:1});
 assert.equal(person.userData.characterMotion.key,pose,'Seating overrides residual interpolation and held-food pose');
 assert.equal(rig.body.position.y,seatHeight-.63,'Hips use the real chair/stool support');
 assert.ok(Math.abs(rig.legs[0].rotation.x-Math.PI/2)<.01,'Legs bend immediately on seating');
}
console.log('PASS stationary feet, stool/chair support and seated handoff poses');

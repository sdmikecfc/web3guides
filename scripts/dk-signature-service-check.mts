import assert from 'node:assert/strict';
import {RECIPES} from '../src/lib/chef/diner/content';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService} from '../src/lib/chef/diner/service';
import {Cook} from './dk-diner-cook-fixture';
import type {ServiceAction} from '../src/lib/chef/diner/types';

for(const [index,recipe] of RECIPES.entries()){
 const config={...buildServiceLoadout(1,[recipe.id]),seed:`signature-${recipe.id}`,menu:[recipe.id],customers:1,tablePatienceTicks:12000,queuePatienceTicks:12000,tutorialLearning:true};
 let ordinary=createService(config),personal=createService({...config,signature:{version:1,recipeId:recipe.id,name:'House favourite',style:(['cream','cherry','sage'] as const)[index%3]}});
 const send=(action:ServiceAction)=>{ordinary=dispatchService(ordinary,action);personal=dispatchService(personal,action);};
 send({type:'open'});const cook=new Cook(()=>personal,send);cook.until(()=>personal.customers[0]?.phase==='seated');cook.dish(recipe.id);
 const guest=personal.customers[0];cook.touch(guest.tableId!,undefined,guest.seatId!);cook.until(()=>personal.tables.some(t=>t.seats.some(s=>s.item?.kind==='dirty')));cook.wash(guest.tableId!,guest.seatId!);
 assert(sanitizeService(personal));assert.equal(personal.served,1);
 const clean=structuredClone(personal);delete clean.config.signature;
 assert.deepEqual(clean,ordinary,`${recipe.id}: signature changed cooking outcomes`);
}
console.log('PASS all 32 signature recipes: identical actions, portions, serving, washing, warmth and earnings to the ordinary recipe.');

/** Loaned recipe help and every rally exit state, without a browser or paid services. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { createDiner, dispatchDiner, dinerPauseCommand, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createService } from '../src/lib/chef/diner/service';
import { buildServiceLoadout } from '../src/lib/chef/diner/geometry';
const loader=Module as unknown as {_load:(request:string,parent:unknown,main:boolean)=>unknown},original=loader._load;
loader._load=function(request,parent,main){return original.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,parent,main);};
const {cookingGuideMenu,cookingGuideRecipe,cookingGuideSteps}=require('../src/app/chef/diner-preview/cooking-guide') as typeof import('../src/app/chef/diner-preview/cooking-guide');
loader._load=original;
const now=Date.UTC(2026,8,22,12);let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
const fresh=()=>createDiner(now,'rally-ui');
const rally=()=>act(fresh(),{type:'startRally'});

check('loaned rally menu exposes fries and lemonade without granting owned recipes',()=>{
  const state=rally(),before=structuredClone(state);
  assert.deepEqual(Object.keys(state.recipes),['classic_burger']);
  assert.deepEqual(cookingGuideMenu(state),['classic_burger','fries','lemonade']);
  for(const id of state.rally.service!.config.menu)assert.equal(cookingGuideRecipe(state,id),id);
  assert.equal(cookingGuideRecipe(state,'tomato_pasta'),'classic_burger');
  assert.deepEqual(state,before);
});
check('each selected rally dish explains its own supply, cooking and serving vessel',()=>{
  const state=rally(),burger=cookingGuideSteps(state,'classic_burger').join(' '),fries=cookingGuideSteps(state,'fries').join(' '),drink=cookingGuideSteps(state,'lemonade').join(' ');
  assert.match(burger,/beef from the fridge/);assert.match(burger,/bun from the pantry/);assert.match(burger,/clean plate/);
  assert.match(fries,/potato from the pantry/);assert.match(fries,/Cut potatoes/);assert.match(fries,/raise its basket/);assert.match(fries,/3 orders/);assert.match(fries,/empty fries box/);assert.match(fries,/carton.*bin/);assert.doesNotMatch(fries,/beef|bun|Grill/);
  assert.match(drink,/lemon from the pantry/);assert.match(drink,/Pour lemonade at the drinks station/);assert.match(drink,/Hold the nearby work control/);assert.match(drink,/clean cup/);assert.doesNotMatch(drink,/burger|beef|bun|basket|Grill/);
});
check('normal truck guides follow the active menu and legacy checkpoints keep their old cooking steps',()=>{
  let state=fresh();state=act(state,{type:'startPractice'});
  state.run!.service=createService({seed:'noodles',tier:2,menu:['vegetable_ramen'],...buildServiceLoadout(2,['vegetable_ramen'])});
  assert.deepEqual(cookingGuideMenu(state),['vegetable_ramen']);assert.equal(cookingGuideRecipe(state,'classic_burger'),'vegetable_ramen');
  const ramen=cookingGuideSteps(state,'vegetable_ramen').join(' ');assert.match(ramen,/Boil noodles/);assert.match(ramen,/vegetable broth from the pantry/);assert.match(ramen,/mixed vegetables from the fridge/);assert.match(ramen,/clean bowl/);
  state.run!.service=createService({seed:'legacy',menu:['fries'],physicalSupplies:false,...buildServiceLoadout(1,['fries'])});
  const fries=cookingGuideSteps(state,'fries').join(' ');assert.match(fries,/fries ingredients from the pantry/);assert.match(fries,/Fry at the fryer/);assert.doesNotMatch(fries,/Cut potatoes|raise its basket|fries box/);
});
check('rally can return home from setup, preparation, active service and pause without touching permanent rewards',()=>{
  for(const phase of ['setup','preparing','playing','paused'] as const){
    let state=rally();state.rally.bestScore=1234;state.rally.completed=2;state.rally.badge=true;
    if(phase==='preparing')state=act(state,{type:'rallyService',action:{type:'prepare'}});
    if(phase==='playing'||phase==='paused')state=act(state,{type:'rallyService',action:{type:'open'}});
    if(phase==='paused')state=act(state,{type:'rallyService',action:{type:'pause'}});
    assert.equal(state.rally.service!.phase,phase);
    const keep={coins:state.coins,pantry:state.pantry,recipes:state.recipes,equipment:state.equipment,runs:state.runsStarted,trophies:state.collections.trophies};
    const pause=dinerPauseCommand(state);if(pause)state=act(state,pause);
    const ended=act(state,{type:'endRally'});assert.equal(ended.rally.service,null);assert.equal(ended.rally.bestScore,1234);assert.equal(ended.rally.completed,2);assert.equal(ended.rally.badge,true);
    assert.deepEqual({coins:ended.coins,pantry:ended.pantry,recipes:ended.recipes,equipment:ended.equipment,runs:ended.runsStarted,trophies:ended.collections.trophies},keep);
    const duplicate=dispatchDiner(ended,{type:'endRally'},{now});assert(duplicate.error);assert.deepEqual(duplicate.state,ended);
  }
});

// Render the real panel with lightweight visual shells; all recipe and reducer logic remains real.
const ts=require('../node_modules/typescript/lib/typescript.js'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const extensions=require.extensions as Record<string,(module:any,filename:string)=>void>;
extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const component=(props:any)=>React.createElement('div',null,props.children);
loader._load=function(request,parent,main){
  if(request.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,name)=>String(name)})};
  if(request==='./DinerAccess')return {useDinerAccess:()=>({mode:'beta'})};
  if(request==='./DinerModal')return {DinerModal:(props:any)=>React.createElement('section',null,React.createElement('h2',null,props.title),props.children,props.footer)};
  if(request==='./ModelIcon')return {ModelIcon:(props:any)=>React.createElement('span',{'data-recipe':props.recipeId})};
  if(request==='./IngredientArt')return {IngredientArt:component};
  if(request==='./DinerIcon')return {DinerIcon:component};
  if(request.startsWith('./')&&!['./cooking-guide','./RecipeUpgrade','./RecipeBook'].includes(request)&&(parent as any)?.filename?.endsWith('DinerPanels.tsx'))return new Proxy({},{get:()=>component});
  if(request==='@rainbow-me/rainbowkit')return {ConnectButton:component};
  return original.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,parent,main);
};
const DinerPanels=require('../src/app/chef/diner-preview/DinerPanels').default;
const {RecipeUpgrade,recipeUpgradeDetails}=require('../src/app/chef/diner-preview/RecipeUpgrade') as typeof import('../src/app/chef/diner-preview/RecipeUpgrade');
const {TruckPacking}=require('../src/app/chef/diner-preview/TruckPacking') as typeof import('../src/app/chef/diner-preview/TruckPacking');
const {RoadsideMarket}=require('../src/app/chef/diner-preview/RecipeLearning') as typeof import('../src/app/chef/diner-preview/RecipeLearning');
const {ServiceLevelCard}=require('../src/app/chef/diner-preview/ServiceLevelCard') as typeof import('../src/app/chef/diner-preview/ServiceLevelCard');
const {TruckHelpers}=require('../src/app/chef/diner-preview/CollectionPanels') as typeof import('../src/app/chef/diner-preview/CollectionPanels');
loader._load=original;
check('the real cooking panel opens directly on the clicked recipe, with loaned tabs and the correct artwork',()=>{
  for(const [id,name] of [['classic_burger','Classic burger'],['fries','Fries'],['lemonade','Lemonade']]){
    const html=renderToStaticMarkup(React.createElement(DinerPanels,{panel:'help',state:rally(),helpRecipeId:id,close:()=>{}}));
    assert.match(html,new RegExp(`<h3>${name}</h3>`));assert.match(html,new RegExp(`data-recipe="${id}"`));assert.match(html,new RegExp(`aria-pressed="true"[^>]*>${name}</button>`));
    for(const label of ['Classic burger','Fries','Lemonade'])assert(html.includes(`>${label}</button>`));
  }
});
check('rally exit screen explains unfinished versus saved results and exposes an actual home control',()=>{
  const state=rally();let html=renderToStaticMarkup(React.createElement(DinerPanels,{panel:'rallyExit',state,close:()=>{}}));
  assert.match(html,/previous best score stays safe/);assert.match(html,/>Back home<\/button>/);assert.match(html,/>Stay in the truck<\/button>/);
  state.rally.service!.phase='complete';html=renderToStaticMarkup(React.createElement(DinerPanels,{panel:'rallyExit',state,close:()=>{}}));assert.match(html,/result will be saved/);assert.doesNotMatch(html,/unfinished attempt/);
});
check('Cook offers recipe upgrades and cookbook selection follows the dish being inspected',()=>{
  const state=fresh();state.recipes.fries={level:2};
  const menu=renderToStaticMarkup(React.createElement(DinerPanels,{panel:'map',state,close:()=>{},open:()=>{}}));assert.match(menu,/>Upgrade dishes<\/button>/);
  const book=renderToStaticMarkup(React.createElement(DinerPanels,{panel:'recipes',state,helpRecipeId:'fries',close:()=>{},open:()=>{}}));
  assert.match(book,/aria-label="Fries"/);assert.match(book,/Upgrade to level 3/);assert.match(book,/Need 1 · Have 0/);assert.match(book,/saved pantry ingredients/);
});
check('recipe guide exposes the actual ingredient-funded upgrade and shows its price gain',()=>{
  let state=fresh();state.pantry={beef:1,bun:1};const before=state.coins,info=recipeUpgradeDetails(state,'classic_burger')!;
  assert.equal(info.ready,true);assert.equal(info.price,25);assert.equal(info.nextPrice,28);assert.deepEqual(info.ingredients.map(item=>[item.id,item.need,item.have]),[['beef',1,1],['bun',1,1]]);
  const element=RecipeUpgrade({state,recipeId:'classic_burger',send:command=>{state=act(state,command);return true;},openBook:()=>{}});
  function descendants(node:any):any[]{if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(descendants)];}
  const upgrade=descendants(element).find(node=>node.type==='button'&&React.Children.toArray(node.props.children).join('')==='Upgrade recipe to level 1');assert(upgrade);assert.equal(upgrade.props.disabled,false);upgrade.props.onClick();
  assert.equal(state.recipes.classic_burger.level,1);assert.equal(state.coins,before);assert.equal(state.pantry.beef,0);assert.equal(state.pantry.bun,0);assert.equal(recipeUpgradeDetails(state,'classic_burger')!.ready,false);
  const missing=renderToStaticMarkup(React.createElement(RecipeUpgrade,{state,recipeId:'classic_burger',send:()=>true,openBook:()=>{}}));assert.match(missing,/disabled=""/);assert.match(missing,/Need 1 · Have 0/);assert.match(missing,/roadside markets/);
  const loaned=renderToStaticMarkup(React.createElement(RecipeUpgrade,{state:rally(),recipeId:'lemonade',send:()=>true,openBook:()=>{}}));assert.match(loaned,/same recipe levels/);assert.doesNotMatch(loaned,/Upgrade recipe to level/);
});
check('truck arrangement has owned pieces and menu selection but no purchase shop',()=>{
  const html=renderToStaticMarkup(React.createElement(TruckPacking,{state:fresh(),placing:null,onChoose:()=>{},send:()=>true}));
  assert.match(html,/Your equipment trailer/);assert.match(html,/>Choose menu<\/button>/);assert.match(html,/Arrange what you own/);assert.doesNotMatch(html,/>Shop<|coins<|Buy equipment|Tier 2 upgrade/);
});
check('roadside mastery set names exact ingredient contents and links to the cookbook',()=>{
  const state=act(fresh(),{type:'startRun'});state.run!.offers=[{id:'ingredients:recipe:classic_burger',kind:'ingredients',target:'classic_burger',price:70,purchased:false}];state.run!.haul=100;
  const html=renderToStaticMarkup(React.createElement(RoadsideMarket,{state,send:()=>true,openRecipe:()=>{}}));
  assert.match(html,/Classic burger upgrade ingredients/);assert.match(html,/1 × Beef · 1 × Bun/);assert.match(html,/70 coins/);assert.match(html,/>Use in cookbook<\/button>/);assert.match(html,/buying does not spend the ingredients/);
});
check('service level explains five permanent clears and leads to assigning a helper',()=>{
  const state=fresh();state.career.services=4;
  let html=renderToStaticMarkup(React.createElement(ServiceLevelCard,{state,openCrew:()=>{}}));
  assert.match(html,/4 \/ 5 cooking rounds cleared/);assert.match(html,/Practice and rally attempts do not count/);assert.doesNotMatch(html,/>Assign helper<\/button>/);
  state.career.services=5;html=renderToStaticMarkup(React.createElement(ServiceLevelCard,{state,openCrew:()=>{}}));
  assert.match(html,/Service level 2/);assert.match(html,/1 helper seat unlocked/);assert.match(html,/>Assign helper<\/button>/);
});
check('helper choices open after five clears between rounds and during setup but freeze during service',()=>{
  let state=act(fresh(),{type:'startRun'});const setup=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});state.career.services=5;
  const render=()=>renderToStaticMarkup(React.createElement(TruckHelpers,{state,send:()=>true}));
  let html=render();assert.match(html,/Assign an existing crew member for free/);assert.doesNotMatch(html,/disabled=""/);
  state.run=setup.run;assert.equal(state.run!.service!.phase,'setup');assert.doesNotMatch(render(),/disabled=""/);
  state.run!.service!.phase='playing';assert.match(render(),/disabled=""/);
  state.run!.service!.phase='paused';assert.match(render(),/disabled=""/);
  state.run=null;state.career.services=4;assert.match(render(),/disabled=""/);assert.match(render(),/Clear 1 more service/);
});
console.log(`PASS ${groups} rally UI groups`);

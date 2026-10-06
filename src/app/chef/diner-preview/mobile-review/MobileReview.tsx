'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { createDiner, dispatchDiner, shopOffers } from '@/lib/chef/diner/progression';
import { DinerAccessContext } from '../DinerAccess';
import {buildServiceLoadout,makeStation} from '@/lib/chef/diner/geometry';
import {destinationService} from '@/lib/chef/diner/routes';
import {createService,dispatchService} from '@/lib/chef/diner/service';
import { betaStorageKeys } from '../beta-access';

const DinerClient=dynamic(()=>import('../DinerClient'),{ssr:false});
// A dev-only, disposable fixture: never read or overwrite a player's wallet save.
const fixtureWallet='0x0000000000000000000000000000000000000000';
const sizes=[[390,844],[360,640],[1280,800],[667,375]];

export default function MobileReview({frame,room=false,shared=false,destination,personal=false}:{frame:boolean;room?:boolean;shared?:boolean;destination?:string;personal?:boolean}){
  const [ready,setReady]=useState(false),[size,setSize]=useState(sizes[0]),[revision,setRevision]=useState(0),[home,setHome]=useState(room),[sharedKitchen,setSharedKitchen]=useState(shared),[place,setPlace]=useState(destination??'');
  useEffect(()=>{
    if(!frame)return;
    const now=Date.now(),keys=betaStorageKeys(fixtureWallet);
    const state=room?createDiner(now,'collection-layout-review'):dispatchDiner(createDiner(now,'mobile-layout-review'),{type:'startRun'},{now}).state;
    if(room){state.coins=25000;state.collections.routeWins=['downtown','festival','business_center'];}
    if(personal){Object.assign(state.career,{services:5,byRoute:{downtown:5},byDifficulty:{slow:5},receipts:Array.from({length:5},(_,i)=>`personal-fixture:${i}`)});state.recipes.classic_burger.level=3;state.pantry.beef=8;state.pantry.bun=8;state.staffMembers[1].name='Robin';}
    if(destination==='first_market'&&state.run){state.truckConfig.stations.push({id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0});const run=state.run;run.position=run.map.find(n=>n.kind==='shop')!.id;run.serviceDays=3;run.available=[];run.haul=500;run.offers=shopOffers(state);}
    if(['festival','business_center','soups'].includes(destination??'')){state.tutorial.finished=true;state.collections.routeWins=['downtown','festival','business_center'];state.run=null;Object.assign(state,dispatchDiner(state,{type:'startRun',routeId:destination==='soups'?'festival':destination!},{now}).state);const menu=destination==='soups'?['tomato_soup','mushroom_soup']:['classic_burger'],tier=destination==='business_center'?3:2;for(const id of menu)state.recipes[id]={level:0};state.truckTier=tier;state.run!.menu=menu;state.run!.tutorial=false;state.run!.position=state.run!.map[0].id;state.run!.service=dispatchService(createService({...buildServiceLoadout(tier,menu,destination==='soups'?{boiler:2}:{}),...destinationService(destination==='soups'?'festival':destination!,0,false,menu.length),tier,menu,practice:true,lessonVersion:0,seed:'destination-ui'}),{type:'prepare'});}
    if(shared&&state.run){const menu=['classic_burger','cheeseburger','bbq_burger'];for(const id of menu)state.recipes[id]={level:0};state.truckTier=2;state.run.menu=menu;state.run.practice=true;state.run.tutorial=false;state.run.position=state.run.map[0].id;state.run.service=dispatchService(createService({...buildServiceLoadout(2,menu),tier:2,menu,practice:true,lessonVersion:0,customers:3,seed:'shared-ui'}),{type:'prepare'});}
    if(destination==='holding_counter'&&state.run){
      const loadout=buildServiceLoadout(1,['classic_burger']);loadout.stations.push(makeStation('holding','pass',5,5));
      let service=dispatchService(createService({...loadout,menu:['classic_burger'],practice:true,lessonVersion:0,seed:'holding-ui'}),{type:'prepare'});
      for(const targetId of ['crate','holding','plates','holding']){
        service=dispatchService(service,{type:'interact',targetId,...(targetId==='crate'?{ingredientId:'bun'}:{})});
        for(let ticks=0;service.chef.path.length&&ticks<400;ticks++)service=dispatchService(service,{type:'tick',ticks:1});
      }
      state.run.practice=true;state.run.tutorial=false;state.run.position=state.run.map[0].id;state.run.service=service;
    }
    if(['serving_vessels','prep_readability'].includes(destination??'')&&state.run){
      const menu=['classic_burger','fries'];
      let service=dispatchService(createService({...buildServiceLoadout(1,menu),menu,practice:true,tutorialLearning:destination==='prep_readability',lessonVersion:destination==='prep_readability'?1:0,seed:'serving-vessels-ui'}),{type:'prepare'});
      const touch=(targetId:string,recipeId?:string,ingredientId?:string)=>{
        service=dispatchService(service,{type:'interact',targetId,recipeId,ingredientId});
        for(let tick=0;service.chef.path.length&&tick<400;tick++)service=dispatchService(service,{type:'tick',ticks:1});
      };
      const finish=(kind:string)=>{
        service=dispatchService(service,{type:'hold',active:true});
        for(let tick=0;!service.stations.find(s=>s.kind===kind)?.slots[0].job?.ready&&tick<800;tick++)service=dispatchService(service,{type:'tick',ticks:1});
        service=dispatchService(service,{type:'hold',active:false});
      };
      touch('crate','fries','potato');touch('prep');finish('prep');touch('prep');touch('fryer');finish('fryer');touch('fryer');
      touch('fridge','classic_burger','beef');touch('grill');finish('grill');touch('grill');touch('prep');touch('crate','classic_burger','bun');touch('prep');if(destination!=='prep_readability'){finish('prep');touch('prep');}
      state.recipes.fries={level:0};state.run.menu=menu;state.run.practice=true;state.run.tutorial=false;state.run.position=state.run.map[0].id;state.run.service=service;
    }
    localStorage.setItem(keys.save,JSON.stringify(state));
    localStorage.setItem(keys.preferences,JSON.stringify({sound:false,musicOn:false}));
    setReady(true);
  },[frame,room,shared,destination,personal]);
  if(frame)return ready?<DinerAccessContext.Provider value={{mode:'beta',wallet:fixtureWallet}}><DinerClient/></DinerAccessContext.Provider>:null;
  return <main style={{padding:20,background:'#ded7cd',minHeight:'100vh',fontFamily:'system-ui',color:'#354c40'}}>
    <h1 style={{fontSize:22}}>Domain Kitchen · layout & collection review</h1>
    <p>Real game controls in a disposable development save. Changing size preserves this test run.</p>
    <nav style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}} aria-label="Review size">
      {sizes.map(value=><button key={value[0]} onClick={()=>setSize(value)} style={{padding:10}}>{value[0]} × {value[1]}</button>)}
      <button style={{padding:10}} onClick={()=>{setHome(value=>!value);setRevision(value=>value+1);}}>{home?"Truck setup":"Restaurant"}</button>
      <button style={{padding:10}} onClick={()=>{setSharedKitchen(value=>!value);setPlace('');setHome(false);setRevision(value=>value+1);}}>Shared prep kitchen</button>
      <button style={{padding:10}} onClick={()=>{setPlace('first_market');setHome(false);setSharedKitchen(false);setRevision(value=>value+1);}}>First market · fries</button>
      <button style={{padding:10}} onClick={()=>{setPlace('holding_counter');setHome(false);setSharedKitchen(false);setRevision(value=>value+1);}}>Holding counter</button>
      <button style={{padding:10}} onClick={()=>{setPlace('prep_readability');setHome(false);setSharedKitchen(false);setRevision(value=>value+1);}}>Bun + patty · prepare</button>
      <button style={{padding:10}} onClick={()=>{setPlace('serving_vessels');setHome(false);setSharedKitchen(false);setRevision(value=>value+1);}}>Food first · plate second</button>
      {['festival','business_center','soups'].map(id=><button key={id} style={{padding:10}} onClick={()=>{setPlace(id);setHome(false);setSharedKitchen(false);setRevision(v=>v+1);}}>{id==='festival'?'Music Festival':id==='soups'?'Mixed soup batches':'Business Center'}</button>)}
      <button style={{padding:10}} onClick={()=>setRevision(value=>value+1)}>Restart test run</button>
    </nav>
    <iframe key={revision} title="Mobile game preview" src={`/chef/diner-preview/mobile-review?frame=1${home?"&room=1":""}${personal?"&personal=1":""}${sharedKitchen?"&shared=1":""}${!home&&place?`&destination=${place}`:''}`} style={{width:size[0],height:size[1],border:'1px solid #b2aa9b',borderRadius:18,background:'#f3e8dc',display:'block'}}/>
  </main>;
}

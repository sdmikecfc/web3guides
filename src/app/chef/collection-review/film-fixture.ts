import {createDiner,dispatchDiner,type DinerCommand,type DinerState} from '@/lib/chef/diner/progression';
import {createPlacementDraft,previewPlacement} from '../diner-preview/placement-preview';
import {physicalHomeScene} from '../diner-preview/physical-home-scene';
import type {DinerSceneData} from '../diner-preview/scene-types';

export const FILM_HEROES=['collect_dragonfire_grill','collect_disco_burger_jukebox','collect_lucky_cat_soda'];
const now=Date.UTC(2026,8,24,12);
function command(state:DinerState,action:DinerCommand){const r=dispatchDiner(state,action,{now});if(r.error)throw Error(r.error);return r.state;}

/** Clean, closed shop for product photography, using real ownership and placement commands. */
export function collectibleFilmScene(shot:0|1|2,revealed:boolean):DinerSceneData{
 let state=createDiner(now,'collection-film-closeups');state.home.name='The Lunch Club';
 for(const id of FILM_HEROES)state.decorOwned[id]=1;
 state.equipment.drinks={tier:1,homeCopies:1,truckOwned:true};
 const drinks=previewPlacement(state,{...createPlacementDraft(state,'home','drinks','film-drinks'),x:3,y:0,rotation:0});
 if(drinks.error)throw Error(drinks.error);state=command(state,drinks.command);
 const target=shot===0?'home-grill':shot===1?'film-jukebox':'film-drinks';
 const jukebox=previewPlacement(state,{...createPlacementDraft(state,'home',FILM_HEROES[1],'film-jukebox'),x:3,y:5,rotation:0});
 if(jukebox.error)throw Error(jukebox.error);
 if(revealed){state=shot===1?command(state,jukebox.command):command(state,{type:'setCollectibleAppearance',location:'home',targetId:target,skinId:FILM_HEROES[shot]});}
 // The public adapter has no private parcels, spills or daily rewards.
 // No customers are admitted during these isolated product shots.
 const scene=physicalHomeScene(state,null,null,'#b85a47');
 const x=shot===0?0:3,z=shot===1?5:0;
 scene.quality='high';scene.reviewCamera={x,y:shot===0?.72:.82,z,vertical:shot===0?2.35:2.5,azimuth:shot===1?-.32:.20,elevation:shot===1?.46:.64};
 if(shot===1&&!revealed)scene.placement={object:jukebox.object,valid:true};
 return scene;
}

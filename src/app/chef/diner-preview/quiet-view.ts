import {createHomeWorld,stepHomeWorld} from '../../../lib/chef/diner/home-simulation';
import {homeSimulationConfig,type DinerState} from '../../../lib/chef/diner/progression';
import {physicalHomeScene} from './physical-home-scene';
/** A presentation copy only. No elapsed time, work or earnings are written back. */
export function quietRestaurantScene(state:DinerState,selected:string|null=null,paint=''){
 const config=homeSimulationConfig(state),world=createHomeWorld({...config,arrivalRate:0,namedVisit:undefined});
 world.fixtureWear=false;stepHomeWorld(world,160);
 const scene=physicalHomeScene(state,world,selected,paint);scene.paused=false;scene.atmosphere='evening';
 for(const person of scene.people){person.pose='idle';person.held=null;}
 return scene;
}


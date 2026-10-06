import * as THREE from 'three';
import {box,cylinder,type CharacterRig} from './models';
export {createRouteEnvironment} from './living-destinations';

export function dressCustomer(body:THREE.Group,type?:string,look=0){
  const rig=body.userData.rig as CharacterRig;if(!rig)return;
  if(type==='party'){
    const color=['#eaaa54','#75d3c4','#cd90dc','#df7965'][look%4];
    rig.head.add(box(.34,.055,.35,color,0,.13,0,.035));
    for(const side of [-1,1])rig.head.add(cylinder(.035,.035,.15,look%2?'#efa954':'#9ddfc6',side*.18,-.05,-.045));
    rig.chest.add(box(.055,.25,.025,color,-.10,.94,-.18,.014),box(.055,.25,.025,color,.10,.94,-.18,.014));
    rig.chest.add(box(.30,.045,.025,color,0,.96,-.177,.008));
    for(const [i,arm] of rig.elbows.entries())arm.add(cylinder(.058,.058,.04,i?'#b5d990':color,0,-.13,0));
    const glasses=box(.30,.065,.055,'#5c5967',0,.02,-.205,.02);rig.head.add(glasses);
  }else if(type==='business'){
    rig.chest.add(box(.053,.19,.025,look%2?'#b58b60':'#577586',0,.95,-.174,.009),box(.088,.06,.02,'#eee3c6',.15,.91,-.18,.005));
    rig.chest.add(box(.018,.10,.019,'#536a68',.15,.96,-.18,.004));
  }else if(type==='gochujang'){
    const red=look%2?'#a32624':'#d8663c';
    rig.head.add(box(.34,.055,.34,red,0,.15,0,.025));
    rig.chest.add(box(.11,.11,.025,'#ead3a1',.12,.96,-.18,.018));
    // A tiny Fireant face badge, worn by spice fans instead of unrelated effects.
    rig.chest.add(cylinder(.026,.026,.022,red,.12,.97,-.207));
  }else if(type==='smoothie'){
    rig.head.add(box(.35,.045,.35,['#e3aa4d','#70a28d','#be7e96'][look%3],0,.13,0,.03));
    rig.chest.add(box(.06,.23,.027,'#f1db9a',-.12,.95,-.18,.015),box(.06,.23,.027,'#f1db9a',.12,.95,-.18,.015));
    for(const arm of rig.elbows)arm.add(cylinder(.059,.059,.04,'#e8ac64',0,-.13,0));
  }else if(type==='wines'){
    rig.chest.add(box(.065,.21,.025,look%2?'#75324c':'#92734c',0,.94,-.18,.009));
    rig.chest.add(box(.05,.07,.025,'#e8dab8',.14,.96,-.18,.008));
  }
}

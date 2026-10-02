import * as THREE from 'three';
import { HOME_TERRACE_DEPTH } from '../../../lib/chef/diner/home-spatial';
import { box, cylinder, material } from './models';

const CREAM='#ece1ce',CURB='#b0b9a5',TEAL='#456c58',CLAY='#be8369',SOIL='#78644e';
const GROUND=-.11,PAVEMENT=-.01;
type Foliage={pivot:THREE.Group;phase:number};
export interface HomeAmbience {root:THREE.Group;update:(time:number,moving?:boolean)=>void}

/** A quiet, physically supported perimeter. Nothing here is a target or a walkable cell. */
export function createHomeAmbience(width:number,height:number):HomeAmbience{
  const depth=height+HOME_TERRACE_DEPTH,root=new THREE.Group(),foliage:Foliage[]=[];
  root.name='home-neighborhood';
  // The narrow pavement apron touches the restaurant foundation on all four sides.
  // Its upper face is below the playable terrace, so that boundary remains readable.
  for(const [x,z,w,d] of [
    [(width-1)/2,-.81,width+.98,.36],[(width-1)/2,depth-.19,width+.98,.36],
    [-.81,(depth-1)/2,.36,depth+.26],[width-.19,(depth-1)/2,.36,depth+.26],
  ]){
    const apron=box(w,.10,d,CREAM,x,(GROUND+PAVEMENT)/2,z,.023);apron.name='attached-pavement';root.add(apron);
  }
  // A restrained kerb and a few recessed joints finish the street edge without adding a grid.
  root.add(box(width+1.02,.085,.075,CURB,(width-1)/2,-.0475,depth-.028,.014));
  for(const x of [-.985,width-.015])root.add(box(.065,.075,depth+1.0,CURB,x,-.0525,(depth-1)/2,.014));
  for(let x=.15;x<width-.2;x+=1.8)root.add(box(.016,.006,.27,'#cfcebb',x,-.006,depth-.19,.002));

  const leafGeometry=new THREE.SphereGeometry(1,10,7);
  // A single foliage geometry is owned by this environment instance, not a global cache.
  const plantedBed=(x:number,z:number,seed:number)=>{
    const bed=new THREE.Group();bed.name=`supported-planted-bed-${seed}`;bed.position.set(x,PAVEMENT,z);
    const support=box(.75,.10,1.93,CREAM,0,-.05,0,.055);support.name='bed-support';bed.add(support);
    bed.add(box(.58,.055,1.72,CLAY,0,.0275,0,.031),box(.46,.045,1.57,SOIL,0,.233,0,.035));
    for(const side of [-1,1]){
      bed.add(box(.075,.23,1.72,CLAY,side*.256,.165,0,.018),box(.63,.23,.075,CLAY,0,.165,side*.823,.018));
      bed.add(box(.087,.045,1.78,'#d7a78b',side*.262,.295,0,.014));
    }
    for(const end of [-.852,.852])bed.add(box(.63,.045,.067,'#d7a78b',0,.295,end,.014));
    for(let i=0;i<3;i++){
      const pivot=new THREE.Group();pivot.position.set(0,.251,-.55+i*.55);foliage.push({pivot,phase:seed*2.2+i*1.7});bed.add(pivot);
      pivot.add(cylinder(.018,.024,.20,'#806b4c',0,.10,0,7));
      const leaves=[[-.11,.20,0,.16,.105,.13],[.10,.26,.015,.17,.11,.135],[-.015,.35,-.015,.16,.16,.145],[.015,.22,.115,.15,.115,.14]];
      leaves.forEach(([lx,ly,lz,sx,sy,sz],j)=>{const leaf=new THREE.Mesh(leafGeometry,material(['#608b61','#81a875','#9ab983'][(i+j+seed)%3]));leaf.position.set(lx,ly,lz);leaf.scale.set(sx,sy,sz);leaf.castShadow=true;leaf.receiveShadow=true;pivot.add(leaf);});
      if(i===1){const flower=new THREE.Mesh(leafGeometry,material('#e4bc72'));flower.scale.set(.043,.03,.043);flower.position.set(.035,.47,.035);pivot.add(flower);}
    }
    root.add(bed);
  };
  // Both beds have their own solid footing joined to the apron; they never consume a room/terrace cell.
  plantedBed(-1.19,height-.12,0);plantedBed(width+.19,height-.12,1);
  root.userData.supportPlane=GROUND;
  return {root,update(time,moving=true){for(const {pivot,phase} of foliage){pivot.rotation.z=moving?Math.sin(time*.72+phase)*.025:0;pivot.rotation.x=moving?Math.sin(time*.53+phase)*.014:0;}}};
}

/** Warm porcelain light on a real wall bracket; no expensive per-lamp dynamic light. */
export function createCafeWallLight(){
  const root=new THREE.Group();root.name='cafe-wall-light';
  const mount=cylinder(.076,.076,.030,TEAL,0,0,.016,14);mount.rotation.x=Math.PI/2;
  const arm=cylinder(.018,.018,.20,TEAL,0,.015,.12,8);arm.rotation.x=Math.PI/2;
  root.add(mount,arm,cylinder(.021,.021,.08,TEAL,0,-.022,.217,8),cylinder(.052,.147,.115,TEAL,0,-.10,.217,18));
  const glow=new THREE.Mesh(new THREE.CylinderGeometry(.119,.119,.013,18),new THREE.MeshBasicMaterial({color:'#ffe6b1'}));glow.position.set(0,-.160,.217);root.add(glow);
  return root;
}

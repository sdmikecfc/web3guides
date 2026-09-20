import * as THREE from 'three';
import type { SceneObject } from './scene-types';

export interface CookingEffects {
  /** Local to the station root. Feedback never intercepts scene interaction. */
  group:THREE.Group;
  setState:(object:SceneObject,surfaceHeight:number)=>void;
  /** Supply frame delta, not absolute time; paused scenes retain their last pose. */
  update:(deltaSeconds:number,paused:boolean,reducedMotion:boolean)=>void;
  dispose:()=>void;
}

const STEAM=1,BUBBLES=2,READY=4,SMOKE=8,PUFFS=3,BUBBLE_COUNT=3;
const HOT=new Set(['grill','fryer','oven','coffee','waffle']);
const frac=(value:number)=>value-Math.floor(value);

/** A bounded, allocation-free frame loop. All geometry/materials belong to this instance. */
export function createCookingEffects(maxSlots=6):CookingEffects {
  const capacity=Math.max(1,Math.min(8,Math.floor(Number.isFinite(maxSlots)?maxSlots:6)));
  const group=new THREE.Group();group.name='cooking-effects';group.userData.inputPassthrough=true;
  const puffGeometry=new THREE.SphereGeometry(1,6,4),bubbleGeometry=new THREE.SphereGeometry(1,6,4),glintGeometry=new THREE.OctahedronGeometry(1,0);
  const steamMaterial=new THREE.MeshBasicMaterial({color:'#fffdf1',transparent:true,opacity:.56,depthWrite:false});
  const smokeMaterial=new THREE.MeshBasicMaterial({color:'#514641',transparent:true,opacity:.72,depthWrite:false});
  const bubbleMaterial=new THREE.MeshBasicMaterial({color:'#ffe3a0',transparent:true,opacity:.75,depthWrite:false});
  const glintMaterial=new THREE.MeshBasicMaterial({color:'#ffe2a0',transparent:true,opacity:.94,depthWrite:false});
  function pool(geometry:THREE.BufferGeometry,material:THREE.Material,count:number,name:string){
    const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);return mesh;
  }
  const steam=pool(puffGeometry,steamMaterial,capacity*PUFFS,'cooking-steam'),smoke=pool(puffGeometry,smokeMaterial,capacity*PUFFS,'burnt-smoke');
  const bubbles=pool(bubbleGeometry,bubbleMaterial,capacity*BUBBLE_COUNT,'cooking-bubbles'),glint=pool(glintGeometry,glintMaterial,capacity,'ready-glint');
  const modes=new Uint8Array(capacity),xs=new Float32Array(capacity),zs=new Float32Array(capacity),progress=new Float32Array(capacity),activity=new Float32Array(capacity);
  const foods:string[]=Array(capacity).fill(''),dummy=new THREE.Object3D();
  progress.fill(-1);let count=0,surface=.93,time=0,dirty=true,disposed=false,lastReduced=false,seed=0;
  function matrix(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,sx:number,sy=sx,sz=sx){
    dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
  }
  function draw(reduced:boolean){
    let hasSteam=false,hasSmoke=false,hasBubbles=false,hasReady=false;
    for(let slot=0;slot<capacity;slot++){
      const mode=modes[slot],x=xs[slot],z=zs[slot],phase=slot*.237+seed,manualBubbles=(mode&BUBBLES)!==0&&activity[slot]!==0;
      hasSteam=hasSteam||(mode&STEAM)!==0;hasSmoke=hasSmoke||(mode&SMOKE)!==0;hasBubbles=hasBubbles||manualBubbles;hasReady=hasReady||(mode&READY)!==0;
      for(let p=0;p<PUFFS;p++){
        const rise=reduced?.30+p*.22:frac(time*.42+phase+p/PUFFS),envelope=Math.sin(rise*Math.PI);
        const dx=Math.sin(phase*8+p*2+rise*3)*.045,dz=Math.cos(phase*5+p*2.2)*.038;
        const steamSize=(mode&STEAM)?(.047+rise*.060)*envelope*(reduced?.75:1):0;
        matrix(steam,slot*PUFFS+p,x+dx,surface+.13+rise*.48,z+dz,steamSize*.80,steamSize*1.38,steamSize*.80);
        const smokeRise=reduced?.27+p*.23:frac(time*.28+phase+p/PUFFS),smokeSize=(mode&SMOKE)?(.055+smokeRise*.110)*Math.sin(smokeRise*Math.PI):0;
        matrix(smoke,slot*PUFFS+p,x+Math.sin(smokeRise*4+phase*8)*.064,surface+.11+smokeRise*.60,z+dz,smokeSize,smokeSize*.85,smokeSize);
      }
      for(let p=0;p<BUBBLE_COUNT;p++){
        const age=reduced?.5:frac(time*1.7+phase+p/BUBBLE_COUNT),radius=manualBubbles?Math.sin(age*Math.PI)*.022:0,angle=phase*8+p*2.1;
        matrix(bubbles,slot*BUBBLE_COUNT+p,x+Math.sin(angle)*.072,surface+.043+age*.045,z+Math.cos(angle)*.068,radius,radius*.65,radius);
      }
      const size=(mode&READY)?(reduced?.042:.038+Math.sin(time*3+phase*5)*.010):0;
      matrix(glint,slot,x+.115,surface+.19,z-.06,size,size*1.75,size*.75);
    }
    steam.visible=hasSteam;smoke.visible=hasSmoke;bubbles.visible=hasBubbles;glint.visible=hasReady;group.visible=hasSteam||hasSmoke||hasBubbles||hasReady;
    steam.instanceMatrix.needsUpdate=true;smoke.instanceMatrix.needsUpdate=true;bubbles.instanceMatrix.needsUpdate=true;glint.instanceMatrix.needsUpdate=true;dirty=false;
  }
  function setState(object:SceneObject,surfaceHeight:number){
    if(disposed)return;
    surface=Number.isFinite(surfaceHeight)?surfaceHeight:.93;group.rotation.y=Math.PI-(object.rotation??0)*Math.PI/2;
    let hash=0;for(let i=0;i<object.id.length;i++)hash=(hash*31+object.id.charCodeAt(i))>>>0;seed=(hash%997)/997;
    const slots=object.slots?.length?object.slots:null;count=Math.min(capacity,slots?.length??1);
    const columns=count>4?3:Math.min(2,count),rows=Math.ceil(count/columns),span=object.kind==='pass'?.50:.28;
    for(let i=0;i<capacity;i++){
      if(i>=count){modes[i]=0;foods[i]='';progress[i]=-1;activity[i]=0;continue;}
      const slot=slots?.[i],food=slots?slot?.food:object.food,state=(slots?slot?.state:object.state)??'idle',nextProgress=(slots?slot?.progress:object.progress)??0;
      const identity=food?`${food.recipeId}:${food.stage??''}:${food.kind}`:'';
      if(identity!==foods[i]){activity[i]=0;progress[i]=-1;foods[i]=identity;}
      xs[i]=(i%columns-(columns-1)/2)*span;zs[i]=(Math.floor(i/columns)-(rows-1)/2)*.31;
      let mode=0;
      if(food?.kind==='burnt')mode=SMOKE;
      else if(food&&!food.cold&&food.kind!=='dirty'){
        if(state==='ready'&&food.kind!=='raw')mode=READY;
        else if(state==='working'){
          if(HOT.has(object.kind))mode|=STEAM;
          if(object.kind==='fryer'){mode|=BUBBLES;activity[i]=-1;}
          // Hand-operated bowls must actually advance, rather than fizz forever
          // merely because unfinished food was left at the station.
          if(object.kind==='blender'){
            mode|=BUBBLES;if(progress[i]>=0&&nextProgress>progress[i]+1e-6)activity[i]=.20;
          }
        }
      }
      modes[i]=mode;progress[i]=nextProgress;if(!(mode&BUBBLES))activity[i]=0;
    }
    dirty=true;
  }
  function update(deltaSeconds:number,paused:boolean,reducedMotion:boolean){
    if(disposed)return;const dt=Number.isFinite(deltaSeconds)?Math.max(0,Math.min(.1,deltaSeconds)):0;
    if(!paused){
      if(!reducedMotion&&group.visible)time+=dt;
      for(let i=0;i<count;i++)if(activity[i]>0){activity[i]=Math.max(0,activity[i]-dt);dirty=true;}
    }
    if(dirty||lastReduced!==reducedMotion||(!paused&&!reducedMotion&&group.visible))draw(reducedMotion);
    lastReduced=reducedMotion;
  }
  function dispose(){
    if(disposed)return;disposed=true;group.removeFromParent();group.clear();
    steam.dispose();smoke.dispose();bubbles.dispose();glint.dispose();puffGeometry.dispose();bubbleGeometry.dispose();glintGeometry.dispose();
    steamMaterial.dispose();smokeMaterial.dispose();bubbleMaterial.dispose();glintMaterial.dispose();
  }
  group.visible=false;return {group,setState,update,dispose};
}

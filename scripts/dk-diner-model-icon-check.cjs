/** Exercise the shipped thumbnail component with deterministic GPU failures.
 * No browser injection or graphics driver is required; Three's actual geometry
 * and camera math remain in use, with only WebGL and React lifecycle adapters.
 * node --preserve-symlinks --preserve-symlinks-main scripts/dk-diner-model-icon-check.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../node_modules/typescript/lib/typescript.js');
const THREE=require('three');
const filename=path.resolve(__dirname,'../src/app/chef/diner-preview/ModelIcon.tsx');
const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;

function harness({frames=false}={}){
  const controls={failInit:0,lossAt:null,constructs:0,renders:0,readbacks:0,disposed:0,built:[]},renderers=[],frameQueue=[];
  class Renderer {
    constructor(){
      controls.constructs++;if(controls.failInit-->0)throw Error('Transient GPU initialization failure');
      this.lost=false;this.domElement=new EventTarget();this.domElement.toDataURL=()=>{
        controls.readbacks++;if(controls.lossAt==='readback'){controls.lossAt=null;this.lost=true;}
        return `data:image/png;test,${controls.readbacks}`;
      };renderers.push(this);
    }
    setSize(){}setPixelRatio(){}getContext(){return {isContextLost:()=>this.lost};}
    render(){controls.renders++;if(controls.lossAt==='render'){controls.lossAt=null;this.lost=true;}}
  }
  const fixture=()=>new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
  const models={createModel:kind=>{controls.built.push(kind);return fixture();},createFoodModel:food=>{controls.built.push(`${food.recipeId}:${food.kind}:${food.mastery??0}`);return fixture();},disposeObject(model){controls.disposed++;model.traverse(obj=>obj.geometry?.dispose());}};
  let current=null;
  const react={
    useState(initial){const inst=current,index=inst.stateIndex++;if(!(index in inst.states))inst.states[index]=initial;return [inst.states[index],value=>{assert(inst.live,'state update after unmount');inst.states[index]=typeof value==='function'?value(inst.states[index]):value;}];},
    useEffect(callback,deps){const inst=current,index=inst.effectIndex++,previous=inst.effects[index];if(previous&&deps.every((value,i)=>value===previous.deps[i]))return;inst.pending.push(()=>{previous?.cleanup?.();inst.effects[index]={deps,cleanup:callback()};});},
  };
  const jsx=(type,props)=>({type,props});
  const module={exports:{}};
  const localRequire=id=>{
    if(id==='react')return react;if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(id==='three')return {...THREE,WebGLRenderer:Renderer};if(id==='./models')return models;
    if(id==='./DinerIcon')return {DinerIcon:()=>null};if(id.endsWith('.css'))return {fallback:'fallback',image:'image'};
    throw Error(`Unexpected dependency: ${id}`);
  };
  vm.runInNewContext(compiled,{module,exports:module.exports,require:localRequire,console,Map,Set,Promise,...(frames?{requestAnimationFrame:callback=>frameQueue.push(callback)}:{})},{filename});
  const render=inst=>{inst.stateIndex=inst.effectIndex=0;current=inst;const output=module.exports.ModelIcon(inst.props);current=null;for(const commit of inst.pending.splice(0))commit();return output;};
  const mount=props=>{const inst={props:typeof props==='string'?{kind:props,label:props}:props,states:[],effects:[],pending:[],stateIndex:0,effectIndex:0,live:true};render(inst);return inst;};
  const image=inst=>{const result=render(inst);return result.type==='img'?result.props.src:null;};
  const unmount=inst=>{for(const effect of inst.effects)effect?.cleanup?.();inst.live=false;};
  const restore=()=>{const renderer=renderers.at(-1);renderer.lost=false;renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));};
  const flush=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));};
  const frame=async()=>{assert(frameQueue.length,'expected a scheduled paint opportunity');frameQueue.shift()();await flush();};
  const update=(inst,props)=>{inst.props={...inst.props,...props};return render(inst);};
  return {controls,renderers,mount,render,image,unmount,restore,flush,frame,update};
}
let groups=0;
async function test(name,body){await body();groups++;console.log(`PASS ${name}`);}
async function main(){
  await test('a rejected studio resets without a retry loop and a later creation recovers mounted fallbacks',async()=>{
    const h=harness();h.controls.failInit=1;const first=h.mount('grill');await h.flush();assert.equal(h.image(first),null);assert.equal(h.controls.constructs,1);
    await h.flush();assert.equal(h.controls.constructs,1,'no timed retry loop');
    const second=h.mount('fryer');await h.flush();assert(h.image(first));assert(h.image(second));assert.equal(h.controls.constructs,2);assert.equal(h.controls.renders,2);
  });
  for(const phase of ['before','render','readback'])await test(`context loss ${phase} cannot poison the image cache; restoration retries the mounted icon`,async()=>{
    const h=harness(),good=h.mount('grill');await h.flush();const goodImage=h.image(good);assert(goodImage);
    const renders=h.controls.renders,readbacks=h.controls.readbacks;
    if(phase==='before')h.renderers[0].lost=true;else h.controls.lossAt=phase;
    const missing=h.mount('fryer');await h.flush();assert.equal(h.image(missing),null);
    assert.equal(h.controls.renders,renders+(phase==='before'?0:1));assert.equal(h.controls.readbacks,readbacks+(phase==='readback'?1:0));
    assert.equal(h.image(good),goodImage,'good cached image survives loss');
    h.restore();await h.flush();const restoredImage=h.image(missing);assert(restoredImage);assert.equal(h.image(good),goodImage);
    const finalRenders=h.controls.renders,duplicate=h.mount('fryer');await h.flush();assert.equal(h.image(duplicate),restoredImage);assert.equal(h.controls.renders,finalRenders,'cache is reused after recovery');
  });
  await test('unmounted fallback icons unsubscribe and repeated restoration only renders missing mounted keys once',async()=>{
    const h=harness(),good=h.mount('grill');await h.flush();h.renderers[0].lost=true;
    const removed=h.mount('sink'),live=h.mount('fryer'),duplicate=h.mount('fryer');await h.flush();h.unmount(removed);
    const count=h.controls.renders;h.restore();h.restore();await h.flush();assert(h.image(live));assert.equal(h.image(duplicate),h.image(live));assert.equal(h.controls.renders,count+1);assert(h.image(good));
    const previous=h.controls.renders;h.mount('sink');await h.flush();assert.equal(h.controls.renders,previous+1,'unmounted key was never rendered by recovery');
  });
  await test('the selected large recipe draws first and every following readback waits for another browser frame',async()=>{
    const h=harness({frames:true}),small=h.mount({kind:'food',recipeId:'fries',label:'Fries',size:76}),hero=h.mount({kind:'food',recipeId:'classic_burger',label:'Burger',size:252}),third=h.mount({kind:'food',recipeId:'coffee',label:'Coffee',size:80});
    await h.flush();assert.equal(h.controls.renders,0,'mount must leave a paint opportunity before GPU work');
    await h.frame();assert.deepEqual(h.controls.built,['classic_burger:dish:0']);assert(h.image(hero));assert.equal(h.image(small),null);assert.equal(h.image(third),null);
    await h.frame();assert(h.image(third));assert.equal(h.image(small),null);assert.equal(h.controls.renders,2);
    await h.frame();assert(h.image(small));assert.equal(h.controls.renders,3);assert.equal(h.controls.constructs,1,'all icons share one graphics context');
  });
  await test('changing recipe never briefly displays the previous recipe and decorative fallbacks stay silent',async()=>{
    const h=harness(),icon=h.mount({kind:'food',recipeId:'classic_burger',label:'',size:80});
    const fallback=h.render(icon);assert.equal(fallback.props['aria-hidden'],true);assert.equal(fallback.props.role,undefined);
    await h.flush();const previous=h.image(icon);assert(previous);
    const changed=h.update(icon,{recipeId:'fries',label:'Fries'});assert.equal(changed.type,'span');assert.equal(changed.props['aria-label'],'Fries');
    await h.flush();assert(h.image(icon));assert.notEqual(h.image(icon),previous);
  });
  await test('an upgraded dish keeps its own earlier plating visible without borrowing other food states or future tiers',async()=>{
    const h=harness(),icon=h.mount({kind:'food',recipeId:'classic_burger',label:'Burger',mastery:0});await h.flush();const starter=h.image(icon);
    assert.equal(h.update(icon,{mastery:3}).props.src,starter);await h.flush();const signature=h.image(icon);assert.notEqual(signature,starter);
    assert.equal(h.update(icon,{mastery:10}).props.src,signature);await h.flush();assert.notEqual(h.image(icon),signature);
    assert.equal(h.update(icon,{mastery:0}).props.src,starter,'higher tiers do not replace lower-tier plating');
    assert.equal(h.update(icon,{foodKind:'raw',mastery:3}).type,'span','raw ingredients cannot borrow a finished dish preview');
    await h.flush();assert(h.image(icon));
  });
  await test('an icon unmounted before its scheduled frame never constructs a GPU context',async()=>{
    const h=harness({frames:true}),icon=h.mount('grill');h.unmount(icon);await h.frame();assert.equal(h.controls.constructs,0);assert.equal(h.controls.renders,0);
  });
  console.log(`${groups} ModelIcon lifecycle groups passed.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});

/** Exercise the shipped button handlers against a real manual cooking job. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {createService,dispatchService}=require('../src/lib/chef/diner/service.ts');
let service=createService({seed:'pointer-prep',menu:['classic_burger'],practice:true,physicalSupplies:false});
function act(action){service=dispatchService(service,action);}
function touch(targetId){act({type:'interact',targetId});for(let t=0;service.chef.path.length&&t<400;t++)act({type:'tick',ticks:1});}
act({type:'prepare'});touch('crate');touch('grill');for(let t=0;!service.stations.find(s=>s.id==='grill').slots[0].job?.ready&&t<800;t++)act({type:'tick',ticks:1});touch('grill');touch('prep');
const remaining=()=>service.stations.find(s=>s.id==='prep').slots[0].job.remaining;
const refs=[],effects=[],listeners=new Map();let cursor=0,mode='hold';
const react={useRef(value){const i=cursor++;return refs[i]??(refs[i]={current:value});},useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||!deps||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();effects[i]={deps,cleanup:fn()};}}};
const source=ts.transpileModule(fs.readFileSync('src/app/chef/diner-preview/HoldAction.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const exportsObject={};
const events={addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}};
new Function('require','exports','window','document',source)(id=>id==='react'?react:id==='./ControlPreferences'?{useControls:()=>({controls:{work:mode}})}:id.endsWith('.css')?{}:require(id),exportsObject,events,{...events,visibilityState:'hidden'});
let button;const render=(disabled=false)=>{cursor=0;button=exportsObject.HoldAction({active:service.chef.holding,label:'Hold to prepare',disabled,onHold:active=>act({type:'hold',active})}).props;};
const event={button:0,pointerId:1,key:'e',repeat:false,preventDefault(){},currentTarget:{focus(){},setPointerCapture(){}}};
render();const initial=remaining();button.onPointerDown(event);render();act({type:'tick',ticks:8});assert(remaining()<initial,'Pressing the actual message works without E');
button.onPointerUp(event);const released=remaining();act({type:'tick',ticks:8});assert.equal(remaining(),released,'Release stops cooking');
for(const end of ['onPointerCancel','onLostPointerCapture','onBlur']){render();button.onPointerDown(event);render();assert(service.chef.holding);button[end](event);assert(!service.chef.holding,end);}
render();button.onPointerDown(event);render();listeners.get('blur')();assert(!service.chef.holding);
render();button.onPointerDown(event);render();listeners.get('visibilitychange')();assert(!service.chef.holding);
render();button.onKeyDown(event);render();assert(service.chef.holding);button.onKeyUp(event);assert(!service.chef.holding);
render(true);button.onPointerDown(event);assert(!service.chef.holding,'Walking/disabled control cannot begin work');
mode='toggle';render();button.onClick(event);render();assert(service.chef.holding);button.onClick(event);assert(!service.chef.holding);
console.log('PASS real prepare button: pointer, keyboard, tap, release, cancellation, blur, visibility and disabled state');

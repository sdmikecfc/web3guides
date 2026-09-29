// Exercise the actual control callbacks without a browser or game simulation.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
class Surface {
 constructor(){this.handlers=new Map();this.children=new Map();this.hidden=true;this.dataset={};this.classList={add(){}};}
 addEventListener(k,f){if(!this.handlers.has(k))this.handlers.set(k,new Set());this.handlers.get(k).add(f);}
 removeEventListener(k,f){this.handlers.get(k)?.delete(f);}
 emit(k,e={}){e.preventDefault=()=>{e.prevented=true;};for(const f of this.handlers.get(k)||[])f(e);return e;}
 querySelector(k){if(!this.children.has(k))this.children.set(k,new Surface());return this.children.get(k);}
 querySelectorAll(){return [];}
 setAttribute(){} append(){} remove(){}
}
const host=new Surface(),document=new Surface(),window=new Surface(),commands=[];
document.body=new Surface();document.createElement=()=>new Surface();document.querySelector=()=>null;
const exportsObject={},engine={command:(kind,edge='press')=>commands.push([kind,edge]),clearControls:()=>commands.push(['clear'])};let playing=true;
const code=ts.transpileModule(fs.readFileSync('art-src/bots/personal-v8/manual-controls.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:exportsObject,require:()=>({}),document,window,location:{origin:'http://localhost'},parent:{},setTimeout});
const ui=exportsObject.manualControls(host,{engine:()=>engine,playing:()=>playing,play:v=>{playing=v;},restart(){},change(){}}),arena=host.querySelector('#fight-canvas');
const down=b=>arena.emit('mousedown',{button:b}),up=b=>document.emit('mouseup',{button:b});
down(0);up(0);assert.deepEqual(commands.splice(0),[['attack','press'],['attack','release']]);
down(1);up(1);assert.deepEqual(commands.splice(0),[['heavy','press']]);
down(2);down(0);up(0);up(2);assert.deepEqual(commands.splice(0),[['defend','press'],['attack','press'],['attack','release'],['defend','release']],'Mouse chords retain independent edges');
down(2);document.emit('keydown',{code:'KeyL',target:{tagName:'CANVAS'}});up(2);assert.deepEqual(commands.splice(0),[['defend','press']],'Mouse release retains keyboard guard');document.emit('keyup',{code:'KeyL'});assert.deepEqual(commands.splice(0),[['defend','release']]);
down(2);document.emit('mousemove',{buttons:0});assert.deepEqual(commands.splice(0),[['defend','press'],['defend','release']],'Missed release reconciles on returning to page');
assert.equal(arena.emit('contextmenu').prevented,true);assert.equal(arena.emit('auxclick').prevented,true);
down(2);window.emit('blur');assert.equal(playing,false);assert.deepEqual(commands.splice(0),[['defend','press'],['clear']]);down(0);assert.equal(commands.length,0,'Paused mouse clicks cannot attack');
ui.dispose();for(const surface of [arena,document,window])for(const handlers of surface.handlers.values())assert.equal(handlers.size,0,'Dispose removes listeners');
console.log('PASS: mouse attack/heavy/hold guard, chords, keyboard overlap, outside release, blur, paused input, native-menu suppression and cleanup.');

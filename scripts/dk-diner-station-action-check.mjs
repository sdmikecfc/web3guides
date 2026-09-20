/** Real anchored-control positioning across phone/desktop viewport boundaries. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('src/app/chef/diner-preview/StationAction.tsx','utf8');
const parsed=ts.createSourceFile('StationAction.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const node=parsed.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text==='stationActionPosition');
assert(node,'missing real position helper');
const js=ts.transpileModule(node.getText(parsed),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {stationActionPosition}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
let cases=0;
for(const [width,height] of [[320,568],[390,844],[503,920],[700,920],[794,920],[1280,720],[1920,1080],[844,390]]){
  for(const cardHeight of [64,76,94])for(const fx of [0,.05,.25,.5,.75,.95,1])for(const fy of [0,.1,.35,.5,.8,.95,1]){
    const anchor={x:width*fx,y:height*fy},card={width:172,height:cardHeight},p=stationActionPosition(anchor,{width,height},card);
    assert(Object.values(p).every(Number.isFinite),'nonfinite anchor calculation');
    assert(p.x>=12&&p.x+172<=width-12,'touch target is clipped horizontally');
    assert(p.y>=Math.min(124,height*.22)&&p.y+cardHeight<=height-Math.min(width<=700?248:180,height*.32),'control overlaps protected HUD areas');
    assert(p.edgeX>=p.x&&p.edgeX<=p.x+172&&p.edgeY>=p.y&&p.edgeY<=p.y+cardHeight,'connector misses the control');
    cases++;
  }
  // With room on all sides, the actual nearest edge stays 44px from the target.
  const center=stationActionPosition({x:width*.5,y:height*.52},{width,height});
  if(height>700)assert(Math.abs(Math.hypot(center.edgeX-width*.5,center.edgeY-height*.52)-44)<1e-6,'control drifts away from a central station');
}
console.log(`Station action positioning PASS: ${cases} actual helper cases; portrait/landscape phone and desktop, multiline labels and viewport edges.`);

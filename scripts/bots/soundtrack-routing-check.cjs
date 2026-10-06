// Real Next matcher compilation: public soundtrack requests must reach static
// files even when the hostname otherwise rewrites every page into a game.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {getMiddlewareMatchers}=require('next/dist/build/analysis/get-page-static-info');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'src/middleware.ts');
const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
let matcher;
for(const statement of source.statements){
 if(!ts.isVariableStatement(statement))continue;
 for(const declaration of statement.declarationList.declarations){
  if(declaration.name.getText(source)!=='config'||!declaration.initializer||!ts.isObjectLiteralExpression(declaration.initializer))continue;
  const property=declaration.initializer.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='matcher');
  assert.ok(property&&ts.isArrayLiteralExpression(property.initializer));
  matcher=property.initializer.elements.map(e=>{assert.ok(ts.isStringLiteral(e));return e.text});
 }
}
assert.ok(matcher?.length,'Use the actual exported middleware matcher');
const compiled=getMiddlewareMatchers(matcher,{}).map(m=>new RegExp(m.regexp));
const intercepts=p=>compiled.some(re=>re.test(p));
for(const asset of ['/Workshop%20Groove.mp3','/Combat%20Loop.mp3','/Caf%C3%A9%20Swing.mp3','/audio/click.ogg','/audio/hit.wav'])assert.equal(intercepts(asset),false,asset+' must bypass page rewrites');
for(const page of ['/','/bots/start','/bots/workshop','/rules','/chef','/chef/dev/reports','/dash'])assert.equal(intercepts(page),true,page+' must retain routing/security middleware');
for(const name of ['Workshop Groove.mp3','Combat Loop.mp3'])assert.ok(fs.statSync(path.join(root,'public',name)).size>100000,'Soundtrack is packaged');
console.log('PASS real Next routing: public MP3/OGG/WAV bypass host rewrites; game pages and protected reports retain middleware; both soundtracks present.');

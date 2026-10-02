/** Load the real TypeScript art dependency graph without emitting build files. */
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const threeURL=pathToFileURL(resolve(root,'node_modules/three/build/three.module.js')).href;
export const THREE=await import(threeURL);
const urls=new Map(),loading=new Set();

function sourcePath(file){
  const absolute=resolve(root,file),extension=extname(absolute);
  const candidates=[absolute,...(!extension?['.ts','.tsx','.mts'].map(ext=>absolute+ext):[]),
    ...(extension==='.js'?[absolute.slice(0,-3)+'.ts']:[]),resolve(absolute,'index.ts')];
  const found=candidates.find(path=>existsSync(path)&&extname(path));
  if(!found)throw new Error(`Diner art check cannot resolve source: ${file}`);
  return found;
}

export function sourceURL(file){
  file=sourcePath(file);
  if(urls.has(file))return urls.get(file);
  if(loading.has(file))throw new Error(`Diner art check encountered a circular source import: ${file}`);
  loading.add(file);
  try{
    let code=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    // Parse the emitted module so comments, type-only imports and quote style
    // cannot accidentally affect dependency rewriting. Re-exports share cache.
    const parsed=ts.createSourceFile(file,code,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS),edits=[];
    for(const statement of parsed.statements){
      if(!ts.isImportDeclaration(statement)&&!ts.isExportDeclaration(statement))continue;
      const specifier=statement.moduleSpecifier;
      if(!specifier||!ts.isStringLiteral(specifier))continue;
      const spec=specifier.text;
      const url=spec==='three'?threeURL:spec.startsWith('three/')?pathToFileURL(resolve(root,'node_modules',spec)).href
        :spec.startsWith('.')?sourceURL(resolve(dirname(file),spec)):spec.startsWith('@/')?sourceURL(resolve(root,'src',spec.slice(2)))
        :spec.startsWith('node:')||spec.startsWith('file:')?spec:null;
      if(!url)throw new Error(`Diner art check cannot load external dependency ${spec} in ${file}`);
      edits.push({start:specifier.getStart(parsed),end:specifier.end,value:JSON.stringify(url)});
    }
    for(const edit of edits.reverse())code=code.slice(0,edit.start)+edit.value+code.slice(edit.end);
    const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
    urls.set(file,url);return url;
  }finally{loading.delete(file);}
}

export function sourceModule(file){return import(sourceURL(file));}

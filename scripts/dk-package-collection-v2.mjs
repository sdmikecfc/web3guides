import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const input=resolve(process.argv[2]??''),names=process.argv.slice(3);if(!/^D:[\\/]/i.test(input)||!names.length)throw Error('Pass the D: source directory and explicit asset names.');
const project=resolve('.'),workspace='D:/Doma/DomainKitchenAssets/collection-v2',version=process.env.DK_ASSET_VERSION??'2.0.0';
const policy={maxTriangles:40000,maxMaterials:16,maxDimensionMeters:3,minDimensionMeters:.01,requireNormals:true,requireUVs:false,requireBaseColorTexture:false,requirePowerOfTwoTextures:true};
const request=join(input,'package-policy.json');writeFileSync(request,JSON.stringify({policy,provenance:{origin:'authored',author:'Domain Kitchen',notes:'Original Blender geometry authored for this project. Hero designs based on existing authorized cinematic reference artwork.'}}));
function cli(args){const run=spawnSync(process.execPath,['D:/Tools/game-dev-source/dist/cli.js',...args,'--output-dir',workspace,'--json'],{encoding:'utf8',env:{...process.env,TEMP:'D:/Temp',TMP:'D:/Temp'},maxBuffer:8e6});if(run.status)throw Error(run.stderr+'\n'+run.stdout);const result=JSON.parse(run.stdout);if(!result.ok)throw Error(JSON.stringify(result));return result.data;}
for(const name of names){
 if(!/^[a-z_]+$/.test(name))throw Error('Invalid asset name');const source=join(input,name+'.glb');if(!existsSync(source))throw Error('Missing '+source);
 const pkg=cli(['package','build',source,'--name',name,'--version',version,'--license','LicenseRef-DomainKitchen-Original','--request',request]);
 const path=pkg.packagePath;cli(['package','verify',path]);
 const args=['vendor','admit',path,'--project',project,'--destination',`public/chef/collectibles-v2/${version==='2.0.0'?name:name+'-'+version}`];
 const plan=cli(args);writeFileSync(join(input,name+'-admission-plan.json'),JSON.stringify(plan,null,2));
 const receipt=cli([...args,'--confirm']);writeFileSync(join(input,name+'-admission.json'),JSON.stringify(receipt,null,2));console.log('ADMITTED',name,path);
}

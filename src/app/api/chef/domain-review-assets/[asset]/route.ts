import {readFile} from 'node:fs/promises';
import {NextResponse} from 'next/server';
import {DOMAIN_COMMON_STUDIES,DOMAIN_SUPER_COMMON_STUDIES,DOMAIN_UNCOMMON_STUDIES,DOMAIN_NEW_STUDY_FOLDERS,hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
import {DOMAIN_ROOM_ASSET_IDS} from '@/lib/chef/diner/domain-room-studies';
import {DOMAIN_KIT_ASSETS} from '@/lib/chef/diner/domain-room-kit-defs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// A small replacement benchmark. Original studies stay on disk; the remaining
// heroes are deliberately not promoted by the Common art pass.
const revisedCommons=new Set(['domain_gochujang_fireant_brigade','domain_smoothie_toucan_bar','domain_wines_midnight_decanter']);
const brigadeCompanions=new Set(['domain_gochujang_midnight_express','domain_smoothie_toucan_bar','domain_smoothie_orbit_blender','domain_smoothie_mango_lagoon','domain_gochujang_volcano_boiler']);
/** Fixed, allowlisted local asset directory. No production asset or arbitrary file access. */
export async function GET(_request:Request,{params}:{params:{asset:string}}){
  if(process.env.NODE_ENV!=='development')return new NextResponse(null,{status:404});
  const id=params.asset.replace(/\.glb$/,'');
  const kit=DOMAIN_KIT_ASSETS.has(id),room=DOMAIN_ROOM_ASSET_IDS.has(id),hero=hasDomainArtStudy(id);
  if(params.asset!==`${id}.glb`||(!hero&&!room&&!kit))return new NextResponse(null,{status:404});
  const folder=Object.hasOwn(DOMAIN_NEW_STUDY_FOLDERS,id)?DOMAIN_NEW_STUDY_FOLDERS[id]:DOMAIN_UNCOMMON_STUDIES.has(id)?'uncommon-set-v1':DOMAIN_SUPER_COMMON_STUDIES.has(id)?'super-common-v1':DOMAIN_COMMON_STUDIES.has(id)?'common-set-v1':id==='domain_smoothie_toucan_bar'?'heroes-r4':kit?'kit':room?'rooms':brigadeCompanions.has(id)?'heroes-r3':revisedCommons.has(id)?'heroes-r2':'heroes';
  try{return new NextResponse(await readFile(`D:/Doma/DomainKitchenAssets/three-worlds-v1/${folder}/${id}.glb`),{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
  catch{return new NextResponse('Local study has not been built.',{status:404});}
}

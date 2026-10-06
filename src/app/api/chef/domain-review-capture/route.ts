import {mkdir,writeFile} from 'node:fs/promises';
import {NextRequest,NextResponse} from 'next/server';
import {DOMAIN_COLLECTIBLE_BY_ID} from '@/lib/chef/diner/domain-worlds';
import {hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
import {DOMAIN_ROOM_ASSET_IDS} from '@/lib/chef/diner/domain-room-studies';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
  if(process.env.NODE_ENV!=='development')return new NextResponse(null,{status:404});
  let origin:URL;try{origin=new URL(request.headers.get('origin')??'');}catch{return new NextResponse(null,{status:403});}
  if(!['localhost','127.0.0.1'].includes(origin.hostname)||origin.host!==request.headers.get('host'))return new NextResponse(null,{status:403});
  const id=request.nextUrl.searchParams.get('id')??'',view=request.nextUrl.searchParams.get('view'),size=request.nextUrl.searchParams.get('size');
  if(!(DOMAIN_ROOM_ASSET_IDS.has(id)||hasDomainArtStudy(id))||!['room','closeup','kit-burger_shop','kit-diner','kit-restaurant'].includes(view??'')||!['desktop','phone'].includes(size??''))return new NextResponse(null,{status:400});
  const length=Number(request.headers.get('content-length'));if(!Number.isSafeInteger(length)||length<=0||length>8_000_000)return new NextResponse(null,{status:413});
  const data=Buffer.from(await request.arrayBuffer());if(data.length>8_000_000||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return new NextResponse(null,{status:400});
  const dir='D:/Doma/DomainKitchenAssets/three-worlds-v1/review',name=`${id}-${view}-${size}.png`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/${name}`,data);
  return NextResponse.json({ok:true,name});
}

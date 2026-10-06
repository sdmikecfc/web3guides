import {readFile} from 'node:fs/promises';
import {NextResponse} from 'next/server';
import {isDomainId} from '@/lib/chef/diner/domain-worlds';
import {hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Local art only. Neither request paths nor production traffic can select files. */
export async function GET(_request:Request,{params}:{params:{asset:string}}){
 if(process.env.NODE_ENV!=='development')return new NextResponse(null,{status:404});
 const id=params.asset;
 if(!isDomainId(id)&&!hasDomainArtStudy(id))return new NextResponse(null,{status:404});
 const file=isDomainId(id)?`domain_room_${id}-room-desktop.png`:`${id}-closeup-desktop.png`;
 try{return new NextResponse(await readFile(`D:/Doma/DomainKitchenAssets/three-worlds-v1/review/${file}`),{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch{return new NextResponse(null,{status:404});}
}

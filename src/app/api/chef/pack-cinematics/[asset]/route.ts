import {readFile} from 'node:fs/promises';
import {NextResponse} from 'next/server';
import {isDomainId} from '@/lib/chef/diner/domain-worlds';
export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Private local media on D:. No public pack release or arbitrary file serving. */
export async function GET(request:Request,{params}:{params:{asset:string}}){
 if(process.env.NODE_ENV!=='development')return new NextResponse(null,{status:404});
 const match=/^(gochujang|smoothie|wines)\.(mp4|jpg)$/.exec(params.asset);
 if(!match||!isDomainId(match[1]))return new NextResponse(null,{status:404});
 try{
  const bytes=await readFile(`D:/Doma/DomainKitchenMedia/pack-openings-2026-10-05/web/${params.asset}`);
  const headers:Record<string,string>={'Content-Type':match[2]==='mp4'?'video/mp4':'image/jpeg','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
  const range=request.headers.get('range');
  if(range){
   const parts=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!parts||(!parts[1]&&!parts[2]))return new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});
   const start=parts[1]?Number(parts[1]):Math.max(0,bytes.length-Number(parts[2]));
   const end=parts[1]&&parts[2]?Math.min(Number(parts[2]),bytes.length-1):bytes.length-1;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length)return new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});
   return new NextResponse(bytes.subarray(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});
  }
  return new NextResponse(bytes,{headers:{...headers,'Content-Length':String(bytes.length)}});
 }catch{return new NextResponse(null,{status:404});}
}

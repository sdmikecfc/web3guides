import {NextRequest,NextResponse} from 'next/server';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
/** Local development capture sink. Fixed D: workspace, no player data or arbitrary paths. */
export async function POST(request:NextRequest){
 if(process.env.NODE_ENV!=='development')return new NextResponse(null,{status:404});
 const origin=request.headers.get('origin'),host=request.headers.get('host');let source:URL|null=null;try{source=origin?new URL(origin):null;}catch{}if(!source||!host||!['127.0.0.1','localhost'].includes(source.hostname)||source.host!==host)return new NextResponse('Local same-origin capture only',{status:403});
 const name=request.nextUrl.searchParams.get('name')??'';
 if(!/^(showcase(-closeups)?\.webm|hero_[0-2]_(before|after)\.png|collection_[a-z_]+(_room_(1280x720|390x844))?\.png|destination_(street|festival|business|boardwalk|night_market)(_(1280x720|390x844|360x640|844x390)(_t[1-4])?_r[0-3]_(low|medium|high))?\.png)$/.test(name))return new NextResponse(null,{status:400});
 const declared=Number(request.headers.get('content-length'));if(!Number.isFinite(declared)||declared<=0||declared>60_000_000)return new NextResponse(null,{status:413});
 const data=Buffer.from(await request.arrayBuffer());if(data.length>60_000_000)return new NextResponse(null,{status:413});
 const dir='D:/Doma/DomainKitchenMedia/collectible-packs-v2-2026-09-24/captures';await mkdir(dir,{recursive:true});await writeFile(path.join(dir,name),data);
 return NextResponse.json({ok:true,file:name});
}

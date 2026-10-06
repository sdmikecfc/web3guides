import {rankedEndpoint} from '@/lib/chef/diner/ranked-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return rankedEndpoint(request,'current');}

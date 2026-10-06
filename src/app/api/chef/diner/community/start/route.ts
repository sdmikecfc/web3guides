import {communityEndpoint} from '@/lib/chef/diner/community-server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const POST=(req:Request)=>communityEndpoint(req,'start');

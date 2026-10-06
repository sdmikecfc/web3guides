import {communityEndpoint} from '@/lib/chef/diner/community-server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(req:Request)=>communityEndpoint(req,'current');

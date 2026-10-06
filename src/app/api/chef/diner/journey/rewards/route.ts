import {domainJourneyEndpoint} from '@/lib/chef/diner/domain-journey-server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(req:Request)=>domainJourneyEndpoint(req,'rewards');

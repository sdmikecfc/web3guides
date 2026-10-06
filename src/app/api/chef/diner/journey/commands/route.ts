import {domainJourneyEndpoint} from '@/lib/chef/diner/domain-journey-server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const POST=(req:Request)=>domainJourneyEndpoint(req,'commands');

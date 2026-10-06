import {reportsReady} from '@/lib/chef/diner/report-server';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({enabled:await reportsReady()},{headers:{'Cache-Control':'no-store'}});}

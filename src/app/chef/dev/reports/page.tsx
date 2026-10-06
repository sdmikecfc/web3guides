import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {reportAdmin} from '@/lib/chef/diner/report-server';
import {ReportInbox} from './ReportInbox';
export const dynamic='force-dynamic';
export const metadata={title:'Domain Kitchen · private reports',robots:{index:false,follow:false}};
export default function Page(){if(process.env.DINER_REPORTS_ENABLED!=='true'||!reportAdmin(headers().get('authorization')))notFound();return <ReportInbox/>;}

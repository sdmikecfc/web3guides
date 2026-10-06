import {notFound} from 'next/navigation';
import {isDomainId} from '@/lib/chef/diner/domain-worlds';
import DomainJourney from '../../diner-preview/DomainJourney';
export const dynamic='force-dynamic';
export const metadata={title:'Domain Kitchen · seasonal journey',robots:{index:false,follow:false}};
export default function Page({params}:{params:{domain:string}}){if(!isDomainId(params.domain)||process.env.DINER_DOMAIN_JOURNEYS_ENABLED!=='true'||process.env.DINER_DOMAIN_JOURNEYS_VERIFIED!=='true')notFound();return <DomainJourney domain={params.domain}/>;}

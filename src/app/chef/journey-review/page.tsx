import {notFound} from 'next/navigation';
import {isDomainId} from '@/lib/chef/diner/domain-worlds';
import DomainJourney from '../diner-preview/DomainJourney';
export const dynamic='force-dynamic';
export const metadata={title:'Domain Kitchen · journey playtest',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:{domain?:string}}){if(process.env.NODE_ENV!=='development')notFound();return <DomainJourney domain={isDomainId(searchParams.domain)?searchParams.domain:'gochujang'} review/>;}

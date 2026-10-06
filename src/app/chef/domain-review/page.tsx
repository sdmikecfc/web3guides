import {notFound} from 'next/navigation';
import {isDomainId} from '@/lib/chef/diner/domain-worlds';
import DomainHub from '../packs/DomainHub';
export const dynamic='force-dynamic';
export const metadata={title:'Three worlds · private creative review',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:{domain?:string}}){
  if(process.env.NODE_ENV!=='development')notFound();
  return <DomainHub initialDomain={isDomainId(searchParams.domain)?searchParams.domain:undefined} review/>;
}

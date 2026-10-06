import {notFound} from 'next/navigation';
import {isDomainId} from '@/lib/chef/diner/domain-worlds';
import PackExperience from '../packs/PackExperience';
import {gachaReadEnabled} from '@/lib/chef/gacha/read-server';
export const dynamic='force-dynamic';
export const metadata={title:'Domain Kitchen · pack experience preview',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:{domain?:string}}){
 if(process.env.NODE_ENV!=='development')notFound();
 return <PackExperience verifiedCollectionReview={gachaReadEnabled(process.env)} initialDomain={isDomainId(searchParams.domain)?searchParams.domain:undefined}/>;
}

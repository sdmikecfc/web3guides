import {notFound} from 'next/navigation';
import {publicPacksEnabled,privatePackFixtureEnabled} from '@/lib/chef/diner/pack-release';
import PackExperience from './PackExperience';
export const dynamic='force-dynamic';
export const metadata={title:'Domain Kitchen · Collectibles',robots:{index:false,follow:false}};
export default function Page(){if(!publicPacksEnabled(process.env)&&!privatePackFixtureEnabled(process.env))notFound();return <PackExperience/>;}

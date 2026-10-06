import {notFound} from 'next/navigation';
import DestinationReview from './DestinationReview';
export const metadata={title:'Domain Kitchen · Living destinations',robots:{index:false,follow:false}};
export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <DestinationReview/>;}

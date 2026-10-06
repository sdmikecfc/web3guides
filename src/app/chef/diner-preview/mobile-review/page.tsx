import { notFound } from 'next/navigation';
import MobileReview from './MobileReview';

export const metadata={title:'Domain Kitchen · Mobile layout review',robots:{index:false,follow:false}};

export default function MobileReviewPage({searchParams}:{searchParams:{frame?:string;room?:string;shared?:string;destination?:string;personal?:string}}){
  if(process.env.NODE_ENV!=='development')notFound();
  return <MobileReview personal={searchParams.personal==='1'} frame={searchParams.frame==='1'} room={searchParams.room==='1'} shared={searchParams.shared==='1'} destination={searchParams.destination}/>;
}

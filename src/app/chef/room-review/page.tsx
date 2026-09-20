import { notFound } from 'next/navigation';
import RoomReview from './RoomReview';
export const metadata={title:'Domain Kitchen · Room review',robots:{index:false,follow:false}};
export default function RoomReviewPage(){if(process.env.NODE_ENV!=='development')notFound();return <RoomReview/>;}

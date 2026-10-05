import { notFound } from 'next/navigation';
import CinematicReview from './CinematicReview';

export const metadata = {
  title: 'Domain Kitchen · A little shop with heart',
  robots: { index: false, follow: false },
};

export default function CinematicReviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <CinematicReview />;
}

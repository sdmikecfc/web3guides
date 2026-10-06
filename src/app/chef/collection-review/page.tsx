import { notFound } from 'next/navigation';
import { isDomainId } from '@/lib/chef/diner/domain-worlds';
import { gachaReadEnabled } from '@/lib/chef/gacha/read-server';
import BetaEntry from '../diner-preview/BetaEntry';
import CollectionRoomFixture from './CollectionRoomFixture';
import CollectionEquipmentFixture from './CollectionEquipmentFixture';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Private collection restaurant review', robots: { index: false, follow: false } };
export default function CollectionReviewPage({ searchParams }: { searchParams: { domain?: string; fixture?: string; equipment?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const domain = searchParams.domain ?? 'gochujang'; if (!isDomainId(domain)) notFound();
  if (searchParams.fixture === '1') return searchParams.equipment === '1' ? <CollectionEquipmentFixture domain={domain}/> : <CollectionRoomFixture domain={domain}/>;
  if (!gachaReadEnabled(process.env)) notFound();
  return <BetaEntry collectionDomain={domain}/>;
}

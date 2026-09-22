import { notFound, redirect } from 'next/navigation';
import { fightRoomHref } from '@/lib/bots/fight-navigation';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Try your special | Model Kombat', robots: { index: false, follow: false } };
export default function StyleFightPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (process.env.BOTS_STYLES_V1 !== '1' && process.env.NODE_ENV === 'production') notFound();
  const query = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  redirect(fightRoomHref(5, query));
}

import { notFound } from 'next/navigation';
import StyleFightClient from './StyleFightClient';
import type { StylePracticeQuery } from '@/lib/bots/style-practice';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Try your special | Model Kombat', robots: { index: false, follow: false } };
export default function StyleFightPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (process.env.BOTS_STYLES_V1 !== '1' && process.env.NODE_ENV === 'production') notFound();
  const query = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as StylePracticeQuery;
  return <StyleFightClient key={JSON.stringify(query)} query={query} />;
}

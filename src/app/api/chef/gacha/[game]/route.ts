import { gachaReadEndpoint } from '@/lib/chef/gacha/read-server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = (req: Request, { params }: { params: { game: string } }) => gachaReadEndpoint(req, params.game);

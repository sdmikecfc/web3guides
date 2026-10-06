import { gachaRoomRewardEndpoint } from '@/lib/chef/gacha/room-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (req: Request, { params }: { params: { game: string } }) => gachaRoomRewardEndpoint(req, params.game);

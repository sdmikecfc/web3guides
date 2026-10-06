import { gachaEquipmentEndpoint } from '@/lib/chef/gacha/equipment-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(req: Request, { params }: { params: { game: string } }) { return gachaEquipmentEndpoint(req, params.game); }
export function POST(req: Request, { params }: { params: { game: string } }) { return gachaEquipmentEndpoint(req, params.game); }

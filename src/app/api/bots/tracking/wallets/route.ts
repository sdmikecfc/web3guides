import { createWalletTrackingHandlers } from '@/app/bots/_server/wallet-tracking';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export const GET=(req:Request)=>createWalletTrackingHandlers().GET(req);
export const POST=(req:Request)=>createWalletTrackingHandlers().POST(req);

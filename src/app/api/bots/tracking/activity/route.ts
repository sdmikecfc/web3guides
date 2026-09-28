import { createWalletTrackingHandlers } from '@/app/bots/_server/wallet-tracking';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(req:Request)=>createWalletTrackingHandlers().activity(req);

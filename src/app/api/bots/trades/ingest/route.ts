import { createMcpTradeHandlers } from "@/app/bots/_server/mcp-trade-intake";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = (req: Request) => createMcpTradeHandlers().POST(req);

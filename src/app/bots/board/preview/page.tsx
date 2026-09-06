/**
 * /bots/board/preview: THE BOARD with sample rows, DEV ONLY.
 *
 * Why it exists: the board's own data comes from real, non-test wallets, and
 * a development database has none (every smoke wallet is is_test and the
 * board excludes those, failing closed). So the real page correctly renders
 * its empty state, and nobody can see the table until the first real garage
 * fights. This route feeds the SAME BoardTable eight hand-written rows so
 * the table can be reviewed and screenshotted at both sizes.
 *
 * It is not reachable in production: NODE_ENV production returns a 404 the
 * same way any missing route does. It holds no database call, no session and
 * no writes. The names are invented and shaped like the real wallet names
 * (two words and a numeral); no address appears here or anywhere else.
 */
import { notFound } from "next/navigation";
import { PageShell } from "../../_components/PageShell";
import { isProduction } from "../../_server/db";
import { BoardTable } from "../BoardTable";
import { SAMPLE_ROWS } from "../sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function BoardPreviewPage() {
  if (isProduction()) notFound();
  return (
    <PageShell>
      <BoardTable rows={SAMPLE_ROWS} />
    </PageShell>
  );
}

import { createServiceClient } from "@/lib/supabase/server";
import { AFFILIATE_LINKS } from "@/lib/affiliates";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = createServiceClient();

  const { data: clickRows } = await supabase
    .from("affiliate_clicks")
    .select("slug, clicked_at, referrer_path, subdomain");

  const clicks = clickRows ?? [];

  const now = Date.now();
  const d7  = now - 7  * 86400_000;
  const d30 = now - 30 * 86400_000;

  const bySlug: Record<string, { total: number; last7: number; last30: number }> = {};
  for (const row of clicks) {
    if (!bySlug[row.slug]) bySlug[row.slug] = { total: 0, last7: 0, last30: 0 };
    bySlug[row.slug].total++;
    const ts = new Date(row.clicked_at).getTime();
    if (ts > d7)  bySlug[row.slug].last7++;
    if (ts > d30) bySlug[row.slug].last30++;
  }

  const pathCount: Record<string, number> = {};
  for (const row of clicks) {
    if (row.referrer_path) {
      pathCount[row.referrer_path] = (pathCount[row.referrer_path] ?? 0) + 1;
    }
  }
  const topPaths = Object.entries(pathCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  const daily: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    daily[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of clicks) {
    const day = row.clicked_at.slice(0, 10);
    if (day in daily) daily[day]++;
  }

  const { count: emailCount } = await supabase
    .from("email_signups")
    .select("*", { count: "exact", head: true });

  const { count: guideCount } = await supabase
    .from("guides")
    .select("*", { count: "exact", head: true });

  const affiliateData = AFFILIATE_LINKS.map((a) => ({
    slug:        a.slug,
    label:       a.label,
    category:    a.category,
    hasRealLink: !a.destination_url.includes("YOURCODE"),
    ...(bySlug[a.slug] ?? { total: 0, last7: 0, last30: 0 }),
  }));

  return (
    <DashboardClient
      affiliateData={affiliateData}
      topPaths={topPaths}
      dailyClicks={Object.entries(daily).map(([date, count]) => ({ date, count }))}
      totalClicks={clicks.length}
      emailCount={emailCount ?? 0}
      guideCount={guideCount ?? 0}
    />
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AFFILIATE_LINKS } from "@/lib/affiliates";
import DashboardClient from "./DashboardClient";

const DASH_PASSWORD = process.env.DASHBOARD_PASSWORD ?? "web3guides-admin";

async function loginAction(formData: FormData) {
  "use server";
  const pw = formData.get("pw") as string;
  const password = process.env.DASHBOARD_PASSWORD ?? "web3guides-admin";
  if (pw === password) {
    const cookieStore = await cookies();
    cookieStore.set("dash_auth", "1", {
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    redirect("/dashboard");
  }
  redirect("/dashboard?error=1");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const cookieStore = await cookies();
  const authed = cookieStore.get("dash_auth")?.value === "1";

  if (!authed) {
    return <DashboardGate action={loginAction} error={searchParams.error === "1"} />;
  }

  const supabase = createServiceClient();

  // ── Click totals per slug ─────────────────────────────────────────────────
  const { data: clickRows } = await supabase
    .from("affiliate_clicks")
    .select("slug, clicked_at, referrer_path, subdomain");

  const clicks = clickRows ?? [];

  // Aggregate by slug
  const bySlug: Record<string, { total: number; last7: number; last30: number; topPath: string }> = {};

  const now = Date.now();
  const d7  = now - 7  * 86400_000;
  const d30 = now - 30 * 86400_000;

  for (const row of clicks) {
    if (!bySlug[row.slug]) bySlug[row.slug] = { total: 0, last7: 0, last30: 0, topPath: "" };
    bySlug[row.slug].total++;
    const ts = new Date(row.clicked_at).getTime();
    if (ts > d7)  bySlug[row.slug].last7++;
    if (ts > d30) bySlug[row.slug].last30++;
  }

  // Top referring paths
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

  // Daily clicks for sparkline (last 14 days)
  const daily: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    daily[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of clicks) {
    const day = row.clicked_at.slice(0, 10);
    if (day in daily) daily[day]++;
  }

  // ── Email signups ─────────────────────────────────────────────────────────
  const { count: emailCount } = await supabase
    .from("email_signups")
    .select("*", { count: "exact", head: true });

  // ── Guide count ───────────────────────────────────────────────────────────
  const { count: guideCount } = await supabase
    .from("guides")
    .select("*", { count: "exact", head: true });

  const affiliateData = AFFILIATE_LINKS.map((a) => ({
    slug:        a.slug,
    label:       a.label,
    category:    a.category,
    hasRealLink: !a.destination_url.includes("YOURCODE"),
    ...( bySlug[a.slug] ?? { total: 0, last7: 0, last30: 0, topPath: "" }),
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

function DashboardGate({ action, error }: { action: (formData: FormData) => Promise<void>; error: boolean }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form action={action} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: 40, width: 360 }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Dashboard</h1>
        <p style={{ color: "#475569", fontSize: 14, margin: "0 0 24px" }}>Enter your password to continue</p>
        {error && (
          <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#fca5a5", fontSize: 13 }}>
            Wrong password — try again
          </div>
        )}
        <input
          name="pw"
          type="password"
          placeholder="Password"
          autoFocus
          style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "12px 14px", color: "#e2e8f0", fontSize: 15, marginBottom: 12, boxSizing: "border-box" as const }}
        />
        <button
          type="submit"
          style={{ width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: "12px 0", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          Enter
        </button>
      </form>
    </div>
  );
}

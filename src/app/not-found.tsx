import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page-content flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="mb-2 font-mono text-7xl font-bold text-glow" style={{ color: "var(--subdomain-accent,#7c6aff)" }}>404</p>
      <h1 className="mb-3 font-display text-3xl font-bold text-white">Page not found</h1>
      <p className="mb-8 max-w-sm" style={{ color: "var(--color-muted,#6272a0)" }}>
        This page doesn&apos;t exist. Head back to the main site.
      </p>
      <Link href="/" className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: "var(--subdomain-accent,#7c6aff)" }}>
        ← Back to Web3Guides
      </Link>
    </div>
  );
}

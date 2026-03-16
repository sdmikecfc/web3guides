import Link from "next/link";
export default function SubdomainNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="mb-2 font-mono text-6xl font-bold text-glow" style={{ color: "var(--subdomain-accent)" }}>404</p>
      <h1 className="mb-3 font-display text-2xl font-bold text-white">Guide not found</h1>
      <p className="mb-8" style={{ color: "var(--color-muted,#6272a0)" }}>
        The guide you&apos;re looking for doesn&apos;t exist or has been removed.
      </p>
      <Link href="/" className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95"
            style={{ background: "var(--subdomain-accent)" }}>
        ← Back to guides
      </Link>
    </div>
  );
}

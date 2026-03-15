import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center grid-bg">
      <p className="mb-2 font-mono text-7xl font-bold text-[#7c6aff]">404</p>
      <h1 className="mb-3 font-display text-3xl font-bold text-white">
        Page not found
      </h1>
      <p className="mb-8 max-w-sm text-[#6b6b8a]">
        This page doesn&apos;t exist. Head back to the main site to find what you&apos;re looking for.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-[#7c6aff] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6b5ae0]"
      >
        ← Back to Web3Guides
      </Link>
    </div>
  );
}

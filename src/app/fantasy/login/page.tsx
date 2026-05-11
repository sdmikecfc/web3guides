import Link from "next/link";

const ERRORS: Record<string, string> = {
  "missing-code": "The link is missing its access code. Run !fantasy enter again to get a fresh one.",
  "invalid-code": "That access code isn't valid.",
  "already-used": "That link has already been used. Run !fantasy enter for a fresh one.",
  "expired": "That access code expired. Run !fantasy enter for a fresh one.",
  "server-error": "Something went wrong on our end. Try again in a moment, or ping a Core Team member.",
  "session-required": "Run !fantasy enter in Discord to get access.",
};

export default function FantasyLogin({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const errorKey = searchParams?.error ?? "";
  const errorMsg = ERRORS[errorKey];

  return (
    <div className="mx-auto max-w-2xl px-6 pt-24 pb-20">
      <div className="glass rounded-2xl p-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-3">
          Access
        </div>
        <h1 className="font-display text-[36px] font-bold tracking-[-0.025em] leading-tight mb-3">
          Run <span className="font-mono text-accent">!fantasy enter</span><br/>in Discord
        </h1>
        <p className="text-[15px] text-muted leading-relaxed mb-6">
          The bot will DM you a one-click magic link. Open it on this device — that's it.
          You'll stay signed in for 24 hours.
        </p>

        <div className="rounded-xl p-4 mb-6" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mb-1.5">
            For the first test
          </div>
          <div className="text-[13px] text-text/90 leading-relaxed">
            The command works only in <span className="font-mono text-accent">#original-gansters</span> for members with the <span className="font-mono text-accent">OG</span> role.
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl p-4 mb-6" style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] mb-1" style={{ color: "#f87171" }}>
              {errorKey}
            </div>
            <div className="text-[13px] text-text/90 leading-relaxed">
              {errorMsg}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Link
            href="/fantasy"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-text transition-colors"
          >
            ← back to landing
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { PageShell } from "./PageShell";
import css from "../info.module.css";

export function InfoPage({
  eyebrow,
  title,
  intro,
  art,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  art: string;
  children: React.ReactNode;
}) {
  return (
    <PageShell
      backdrop={{ background: `url(${art}) center top / cover no-repeat`, opacity: 0.42 }}
      scrim={{ background: "linear-gradient(180deg, rgba(21,16,13,.3), #17120f 520px, #17120f 100%)" }}
    >
      <article className={css.page}>
        <nav className={css.back} aria-label="Model Kombat information">
          <Link href="/bots">← Back to the garage</Link>
          <span>Model Kombat</span>
        </nav>
        <header className={css.hero}>
          <p className={css.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
        </header>
        <div className={css.paper}>{children}</div>
        <nav className={css.links} aria-label="Rules and legal pages">
          <Link href="/bots/rules">Rules</Link>
          <Link href="/bots/privacy">Privacy</Link>
          <Link href="/bots/terms">Terms</Link>
          <Link href="/bots/disclaimer">Disclaimer</Link>
        </nav>
      </article>
    </PageShell>
  );
}

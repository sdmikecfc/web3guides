import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Model Kombat — Remaster preview", robots: { index: false, follow: false } };

/** A bookmarked proof link opens inside the same game window. */
export default function RemasterPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (process.env.NODE_ENV === "production" && process.env.BOTS_REMASTER_PREVIEW !== "1") notFound();
  const query = new URLSearchParams({ view: "fight", combat: "7" });
  for (const key of ["style", "rival", "seed", "mode", "clean"]) {
    const value = searchParams[key], text = Array.isArray(value) ? value[0] : value;
    if (text !== undefined) query.set(key, text);
  }
  redirect(`/bots?${query}`);
}

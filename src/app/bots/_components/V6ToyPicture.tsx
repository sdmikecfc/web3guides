"use client";
import { useEffect, useRef, useState } from "react";
import type { BuildV6, SocketV6 } from "@/lib/bots/v6";
import { photographKeyV6, photographToyV6 } from "../_view/v6-photograph";

/** Exact static model photographs share a queue, never one live canvas per shelf tile. */
export default function V6ToyPicture({ build, slot, visibleSlots, title, className, active = true }: { build: BuildV6; slot?: SocketV6; visibleSlots?: SocketV6[]; title: string; className?: string; active?: boolean }) {
  const host = useRef<HTMLSpanElement>(null), [visible, setVisible] = useState(false), [result, setResult] = useState({ key: "", image: "", error: "" });
  const key = photographKeyV6(build, { slot, visibleSlots });
  useEffect(() => { if (!host.current) return; const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: "100px" }); observer.observe(host.current); return () => observer.disconnect(); }, []);
  useEffect(() => {
    if (!active || !visible) return;
    let cancelled = false;
    void photographToyV6(build, { slot, visibleSlots }, () => !cancelled).then(image => { if (!cancelled && image) setResult({ key, image, error: "" }); }).catch(error => { if (!cancelled) setResult({ key, image: "", error: error instanceof Error ? error.message : "Picture could not load" }); });
    return () => { cancelled = true; };
    // Canonical parts and frozen asset/proxy versions define the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, visible]);
  const current = result.key === key;
  return <span ref={host} className={className} data-v6-picture-ready={current && !!result.image} data-v6-picture-error={current && result.error || undefined} style={{ display: "block", position: "relative", width: "100%", height: "100%", minHeight: 24 }}>{current && result.image ? <img src={result.image} alt={title} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} /> : <span role="status" aria-label={current && result.error ? `${title} picture could not load` : `Loading ${title}`} style={{ display: "grid", placeItems: "center", height: "100%", minHeight: 24, fontSize: 10 }}>{current && result.error ? "Picture could not load" : "…"}</span>}</span>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import EntryDialog from "./EntryDialog";
import css from "./entry.module.css";

/** The media request starts only after the visitor explicitly opens this player. */
export default function TrailerPlayer({ onClose }: { onClose: () => void }) {
  const [manifest, setManifest] = useState<{ widescreen: string; poster: string; credit: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    return () => { if (video) { video.pause(); video.removeAttribute("src"); video.load(); } };
  }, [manifest]);
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = window.setTimeout(() => { if (mounted) setFailed(true); controller.abort(); }, 12000);
    fetch("/bots-art/trailer/manifest.json", { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(v => {
        if (!v || typeof v.widescreen !== "string" || typeof v.poster !== "string" || typeof v.credit !== "string") throw new Error("Invalid trailer");
        if (mounted && !controller.signal.aborted) setManifest(v);
      })
      .catch(() => { if (mounted && !controller.signal.aborted) setFailed(true); })
      .finally(() => window.clearTimeout(timeout));
    return () => { mounted = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);
  return <EntryDialog title="Little robots. Big fights." onClose={onClose}>{manifest ? <><video ref={videoRef} className={css.video} controls autoPlay playsInline preload="metadata" poster={manifest.poster} src={manifest.widescreen} /><p className={css.credit}>{manifest.credit}</p></> : <p role="status">{failed ? "The trailer is not ready to watch yet. You can still build a robot or look around." : "Opening the trailer…"}</p>}<button className={css.secondary} onClick={onClose}>Back to the game</button></EntryDialog>;
}

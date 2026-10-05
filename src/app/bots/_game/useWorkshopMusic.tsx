"use client";
import { useEffect, useRef, useState } from "react";
import { createWorkshopSoundtrack, MUSIC_SETTINGS, type MusicStatus } from "./workshop-soundtrack";

/** One soundtrack for the shell; combat effects remain inside the renderer. */
export default function useWorkshopMusic(battle: boolean, suspended = false) {
  const player = useRef<ReturnType<typeof createWorkshopSoundtrack> | null>(null);
  const [settings, setSettings] = useState({ enabled: true, volume: .3 });
  const [ready, setReady] = useState(false), [status, setStatus] = useState<MusicStatus>("waiting");
  const current = useRef({ ...settings, battle, suspended });
  current.current = { ...settings, battle, suspended };

  useEffect(() => {
    let saved = { enabled: true, volume: .3 };
    try {
      const value = JSON.parse(localStorage.getItem(MUSIC_SETTINGS) || "null");
      if (typeof value?.enabled === "boolean") saved.enabled = value.enabled;
      if (typeof value?.volume === "number" && Number.isFinite(value.volume)) saved.volume = Math.max(0, Math.min(.8, value.volume));
    } catch { /* Storage is optional. */ }
    current.current = { ...current.current, ...saved };
    setSettings(saved); setReady(true);
    const controller = createWorkshopSoundtrack(new Audio(), setStatus);
    player.current = controller;
    controller.configure(current.current);
    controller.visibility(document.hidden || current.current.suspended);
    const gesture = () => { if (!current.current.suspended) controller.gesture(); };
    const visibility = () => controller.visibility(document.hidden || current.current.suspended);
    // Keep listening so a blocked first attempt can recover on the next click or key.
    window.addEventListener("pointerdown", gesture);
    window.addEventListener("click", gesture);
    window.addEventListener("keydown", gesture);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("click", gesture);
      window.removeEventListener("keydown", gesture);
      document.removeEventListener("visibilitychange", visibility);
      controller.dispose(); player.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    player.current?.configure({ ...settings, battle });
    player.current?.visibility(document.hidden || suspended);
    try { localStorage.setItem(MUSIC_SETTINGS, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  }, [battle, ready, settings, suspended]);

  const change = (next: typeof settings) => {
    current.current = { ...next, battle, suspended };
    player.current?.configure(current.current);
    player.current?.gesture();
    setSettings(next);
  };
  const audible = settings.enabled && settings.volume > 0;
  const retry = () => change({ enabled: true, volume: settings.volume || .3 });
  return <details style={{ position: "relative" }}>
    <summary aria-label="Music settings" title={status === "playing" ? "Music playing" : "Music settings"} style={{ cursor: "pointer", padding: "8px", listStyle: "none" }}>{status === "playing" ? "♫" : "♪"}</summary>
    <div style={{ position: "absolute", right: 0, top: "var(--music-panel-top, 100%)", bottom: "var(--music-panel-bottom, auto)", width: 205, padding: 14, zIndex: 40, background: "var(--mk-surface)", border: "1px solid var(--mk-edge)", borderRadius: 12 }}>
      <button aria-pressed={settings.enabled} onClick={() => change({ ...settings, enabled: !settings.enabled })}>Music {settings.enabled ? "on" : "off"}</button>
      <label style={{ display: "grid", gap: 7, marginTop: 12 }}>Music volume<input aria-label="Music volume" type="range" min="0" max="80" value={Math.round(settings.volume * 100)} onChange={e => change({ ...settings, volume: Number(e.target.value) / 100 })} /></label>
      <p role="status" style={{ fontSize: 12, margin: "10px 0" }}>{!audible ? "Music is muted." : status === "playing" ? (battle ? "Playing Combat Loop" : "Playing Workshop Groove") : status === "unavailable" ? "The song could not load. Try again." : status === "paused" ? "Music paused." : "Press Play music to start."}</p>
      {audible && status !== "playing" && <button onClick={retry}>Play music</button>}
    </div>
  </details>;
}

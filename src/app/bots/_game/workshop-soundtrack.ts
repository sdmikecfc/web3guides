export const MUSIC_SETTINGS = "mk.music.v1";
export const MUSIC_TRACKS = { menu: "/Workshop%20Groove.mp3", battle: "/Combat%20Loop.mp3" };
export type MusicStatus = "waiting" | "playing" | "paused" | "blocked" | "unavailable";

/** Keep play() inside the user gesture, including retries after autoplay rejection. */
export function createWorkshopSoundtrack(element: HTMLAudioElement, report: (status: MusicStatus) => void) {
  let enabled = true, volume = .3, battle = false, unlocked = false, hidden = false;
  let disposed = false, pending = false, attempt = 0;
  element.loop = true;
  element.preload = "none";
  const stop = () => { attempt++; pending = false; element.pause(); };
  const sync = () => {
    if (disposed) return;
    element.volume = volume;
    if (!enabled || hidden || volume === 0) { stop(); report("paused"); return; }
    if (!unlocked) { report("waiting"); return; }
    const track = battle ? MUSIC_TRACKS.battle : MUSIC_TRACKS.menu;
    if (element.getAttribute("src") !== track) {
      stop(); element.src = track; element.load();
    }
    if (pending || !element.paused) return;
    pending = true;
    const current = ++attempt;
    // This call must remain synchronous: deferring it to a React effect can lose activation.
    void element.play().then(() => {
      if (!disposed && current === attempt) { pending = false; report("playing"); }
    }).catch((error: unknown) => {
      if (disposed || current !== attempt) return;
      pending = false;
      report(error instanceof Error && error.name === "NotAllowedError" ? "blocked" : "unavailable");
    });
  };
  return {
    configure(next: { enabled: boolean; volume: number; battle: boolean }) {
      enabled = next.enabled; volume = next.volume; battle = next.battle; sync();
    },
    gesture() { unlocked = true; sync(); },
    visibility(isHidden: boolean) { hidden = isHidden; sync(); },
    dispose() { disposed = true; stop(); element.removeAttribute("src"); element.load(); },
  };
}

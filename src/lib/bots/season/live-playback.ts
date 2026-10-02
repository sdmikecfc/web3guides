import { acceptSpecialV6, stepFightV6, RULES_V6, validBuildV6 } from "@/lib/bots/v6";
import type { StateV6, EventV6 } from "@/lib/bots/v6";
import type { SeasonMatch } from "./types";
import { SEASON_RULES } from "./rules";

export const SEASON_PLAYBACK_UNAVAILABLE = "This fight needs its saved robot and combat rules. Your saved result is safe.";
const canonical = (value: unknown): string => value && typeof value === "object" ? Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
/** One identity gate for server advancement and browser replay. It never repairs a saved proof. */
export function seasonSnapshotMatchesRules(snapshot: { seed: unknown; rules: unknown; builds: unknown; state: StateV6 | null }): boolean {
  try {
    return Number.isInteger(snapshot.seed) && Number(snapshot.seed) >= 0 && Number(snapshot.seed) <= 4294967295 &&
      canonical(snapshot.rules) === canonical({ ...SEASON_RULES, engine: RULES_V6 }) &&
      Array.isArray(snapshot.builds) && snapshot.builds.length === 2 && snapshot.builds.every(validBuildV6) &&
      (!snapshot.state || snapshot.state.version === 6 && snapshot.state.rulesVersion === RULES_V6.rulesVersion &&
        snapshot.state.catalogVersion === RULES_V6.catalogVersion && snapshot.state.seed === snapshot.seed &&
        canonical(snapshot.state.builds) === canonical(snapshot.builds));
  } catch { return false; }
}
export function seasonSessionPlaybackAvailable(session: SeasonMatch): boolean {
  return session.playbackAvailable !== false && !!session.state && session.tick === session.state.frame && seasonSnapshotMatchesRules(session);
}

/** Polls and input replies may arrive in either order. A route owns one session. */
export function acceptsSeasonSnapshot(current: SeasonMatch | null, incoming: SeasonMatch, sessionId: string): boolean {
  return incoming.id === sessionId && incoming.tick === incoming.state.frame &&
    (!current || current.id === incoming.id && incoming.revision >= current.revision && incoming.tick >= current.tick &&
      (current.status !== "complete" || incoming.status === "complete"));
}

/** Draw only confirmed ticks, applying saved inputs before their exact simulation step. */
export function advanceSeasonPicture(picture: StateV6, confirmed: StateV6, stepBudget: number): void {
  if (picture.frame > confirmed.frame) throw new Error("The arena advanced beyond its saved fight.");
  let cursor = picture.commands.length;
  const applyInputs = () => {
    while (cursor < confirmed.commands.length && confirmed.commands[cursor].frame <= picture.frame) {
      const command = confirmed.commands[cursor++];
      if (command.frame !== picture.frame || !acceptSpecialV6(picture, command).accepted) {
        throw new Error("The arena could not follow the saved Special presses.");
      }
    }
  };
  applyInputs();
  let left = Math.max(0, Math.min(180, Math.floor(stepBudget)));
  while (!picture.done && picture.frame < confirmed.frame && left-- > 0) {
    stepFightV6(picture);
    applyInputs();
  }
}

export function seasonMoment(event: EventV6, viewer: 0 | 1): string | null {
  const who = event.who === viewer ? "Your robot" : "The rival";
  const target = event.target === viewer ? "your robot" : "the rival";
  if (event.kind === "block") return `${event.target === viewer ? "Your robot" : "The rival"} blocked ${Math.round(event.absorbed ?? 0)} damage.`;
  // A break records the damaged fighter in `who`, unlike contact events.
  if (event.kind === "break") return `${who} lost ${event.slot === "armL" || event.slot === "armR" ? "an arm" : event.slot === "legL" || event.slot === "legR" ? "a leg" : event.slot === "head" ? "its head" : "its body armour"}.`;
  if (event.kind === "shove") return `${who} pushed back to make room.`;
  if (event.kind === "interrupt") return `${who} had an attack interrupted.`;
  if (event.kind === "knockdown") return `${who} knocked ${target} down.`;
  return null;
}

export function seasonPayoutText(session: SeasonMatch): string {
  const payout = session.settlement;
  if (!payout) return "Saving the result…";
  if (session.viewerSide === 1) return "Recorded defense. No coins were won or lost.";
  const total = payout.playCoins + payout.objectiveCoins + payout.tradeBonus;
  return `${total > 0 ? "+" : ""}${total} season coins${payout.tradeBonus < 0 ? " (includes a corrected trade bonus)" : ""}`;
}

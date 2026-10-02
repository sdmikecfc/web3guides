/**
 * SEASON 5 · IRON SIEGE — WARPATH route (game key stays "warpath").
 * Server component: resolves the locale exactly like every other /s5 server
 * page (dict(getLocale()), src/lib/s5/i18n), builds the localized strings
 * pack from the dict's arcade section (shared shell chrome + this game's
 * overrides + the idle-card copy) and hands it to ./Client, which merges it
 * over its English defaults. Game names, tank names and share payloads stay
 * English in every locale per the dict rules. Rules, scoring and the
 * maxScore/floorMs math are documented in ./sim; the replay baseline lives
 * in ./tape.ts.
 */
import { dict, getLocale } from "@/lib/s5/i18n";
import Client from "./Client";

export default function HoldTheLinePage() {
  const a = dict(getLocale()).arcade;
  return (
    <Client
      strings={{
        intro: a.warpath.intro,
        introDaily: a.warpath.introDaily,
        arena: a.warpath.arena,
        shell: {
          ...a.shell,
          startIdle: a.warpath.startIdle,
          startAgain: a.warpath.startAgain,
          scoreUnit: a.warpath.scoreUnit,
          dailyResultNote: a.warpath.dailyResultNote,
        },
      }}
    />
  );
}

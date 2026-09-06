/**
 * SEASON 5 · IRON SIEGE — ARMOR CLASH route (key "armorclash").
 * Server component: resolves the locale exactly like every other /s5 server
 * page (dict(getLocale()), src/lib/s5/i18n) and hands the localized shell
 * chrome plus this game's own flavor strings to ./Client.
 *
 * The four game-flavor fields (startIdle / startAgain / scoreUnit /
 * dailyResultNote) MUST come from the per-game pack, not from `arcade.shell`:
 * shell carries GENERIC defaults ("Start", "Play again", empty unit) that would
 * otherwise win over this game's copy in every locale.
 *
 * Rules, scoring and the maxScore/floorMs math are documented in ./sim; the
 * replay baseline lives in ./tape.ts.
 */
import { dict, getLocale } from "@/lib/s5/i18n";
import Client from "./Client";

export default function ArmorclashPage() {
  const a = dict(getLocale()).arcade;
  return (
    <Client
      strings={{
        intro: a.armorclash.intro,
        introDaily: a.armorclash.introDaily,
        arena: a.armorclash.arena,
        shell: {
          ...a.shell,
          startIdle: a.armorclash.startIdle,
          startAgain: a.armorclash.startAgain,
          scoreUnit: a.armorclash.scoreUnit,
          keyboardHint: a.armorclash.keyboardHint,
          dailyResultNote: a.armorclash.dailyResultNote,
        },
      }}
    />
  );
}

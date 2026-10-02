# Personal robots and twelve kits — development checkpoint

Status: implementation and review in progress. Not production or balance approved.

## Local implementation

Authoring and viewer: `.bots-preview/tank-bible-rebuild/` (local ignored art workspace).
- `art/build_weapon_kits.py`: 40 authored melee/alternative weapon GLBs plus eight unchanged approved firearm entries, all in `assets/weapon-kits-1/manifest.json`.
- `viewer/weapon-actions.ts`: twelve profiles and 36 action definitions, unfrozen tuning.
- `viewer/v8-engine.ts`: seeded fixed-step practice, shared poses/contact, directional defence, accepted special input replay.
- `viewer/paint.ts`, `banner.ts`: separate cosmetic data, material masks, local processed images.
- `viewer/practice-viewer.ts`: practice and replay renderer.
- `.blend` sources retained in `art/weapon-kits-1/`.

Open `http://127.0.0.1:3157/?view=parts` or `?view=practice`.
Build: `node --preserve-symlinks --preserve-symlinks-main .bots-preview/tank-bible-rebuild/viewer/bootstrap.cjs build`.
Serve: same command with `serve --no-build` in place of `build`.

Main-shell development bridge: set `NEXT_PUBLIC_BOTS_PERSONAL_PREVIEW=1` when starting Next dev and open `/bots?view=fight&combat=8`. It reads only allowlisted assets beneath this local study. Disabled in production even when the public flag is set. Shipping an independently packaged asset bundle remains a separate gate.

## Boundaries

Original approved model GLBs and earlier engines are not rewritten. Body proportions remain the approved catalogue. Paint does not change equipment, GP or combat. Banner bytes remain in local IndexedDB; no upload/public hosting. No new reward, trading, wallet, accounting or Doma Reporter changes.

## Restart checkpoint — 16 September 2026

The preview was restored after restart. Latest review URLs:
- Standalone: `http://127.0.0.1:3157/?view=practice&revision=footwork-spacing-4`
- Parts/paint: `http://127.0.0.1:3157/?view=parts`
- Main game shell: `http://127.0.0.1:3188/bots?view=fight&combat=8`

The user confirmed that body parts do still fall off in real fights. Do not add cosmetic limb losses or change durability just to force more breaks. Their latest feedback is to increase the gap between fighters and make movement substantially more active.

### Changes following that feedback

- Removed the miss-driven distance reduction that caused fighters to press against each other.
- Weapon-specific engagement spacing, larger body clearance, real short entry/escape bursts, lateral recovery and impact velocity.
- More articulated stepping, planted-foot recovery and body lean driven by actual velocity.
- Fixed Special pose timing: animation/collision now use scaled action elapsed time, including Overdrive and Slow Field.
- Rifle bore and thrust paths converge toward their target through the weapon pose. Projectiles still use the real muzzle direction.
- Spears choose between long and shortened attacks at usable distances; the two-handed spear slides its grip for a functional butt strike.
- Local damage subdivision preserves normalized vertex colours, fixing pale damaged armour.
- Camera bounds no longer scan every vertex per rendered frame. Core health and the defeat explanation are clearer.

### Evidence

- 48 actual-renderer weapon thumbnails and nine painted-family previews.
- Per-part paint persistence/isolation, crop upload, malformed/oversized image rejection, repeat repaint resources and responsive personalisation checks passed.
- 12,636 grip samples, 96 limb dependency checks, directional guard/shield checks and 18 scaled action-clock checks passed on the current footwork rules (7b2d5d813de1cd6a / motion 8c33e0cb953bf50e).
- Five matchups reproduced events, damage, accepted inputs and results at batches of 1/2/4 steps per rendered frame.
- Eight repeated browser fights had identical damage/events and stable GPU resource counts; phone/short-landscape layouts, reduced motion and keyboard controls passed again after the footwork and debris settling changes.
- Main-shell preview loaded with persistent game navigation and no page errors.
- Current footwork recordings measured median approximately 16.7 ms; p95 ranged from 16.9 to 33.5 ms while headless simulation checks also ran on Intel Iris Xe, Edge/ANGLE/D3D11, 1280×800. This is desktop evidence, not a physical-phone measurement.
- The current 144-pair T3 footwork matrix remains below the balance gate: four time-limit decisions, seven kit averages outside 40–60%, side win-rate difference 4.17 percentage points on one tuning seed. This is coverage, not held-out balance approval. See review/footwork-t3.json and review/balance-evaluation-current.json.

## Required remaining review

Review current uninterrupted fights, all action/defence semantics and mixed assemblies. Complete current T1–4 ordered pairings, held-out balance and side-bias checks. Current full-fight recordings are in review/footage/ with pinned versions in review/uninterrupted-fights.json. The subsequent presentation-only debris settling fix is available in the live preview. Record release footage only after visual approval. Physical-phone hardware remains unavailable. Package the ignored local assets separately before any release integration.

The new melee designs and ordinary fights still require visual review. Numerical tuning is unfrozen and not release approved. Headless tests cannot grant visual approval.

Reports, screenshots and full fight recordings are in `.bots-preview/tank-bible-rebuild/review/`. Every new combat report and video record should include the exact rules/motion versions. Original approved model GLBs and earlier combat versions remain intact.

## 2026-09-17 — animated arenas, visual picking, personality and one-arm fallback

Open `http://127.0.0.1:3157/?view=practice&arena=spaceship&revision=animated-arenas-backup-3`.
The same local assets are served inside the development game shell on port 3188. Restart the study with `node --preserve-symlinks --preserve-symlinks-main .bots-preview/tank-bible-rebuild/viewer/bootstrap.cjs serve --no-build` from the repository root. The local preview server was restarted on 2026-09-17 to apply the MP4 MIME mapping; it now serves video/mp4.

### Delivered in the local preview

- Starship, Roman Colosseum and Underground arenas: approved imagegen reference plates animated with Higgsfield Kling 3 Pro. Each file is approximately five seconds, 1916×1080, 24 FPS, silent. Their fixed camera matches the approved fighter-scale review; real robot shadows sit on a transparent Three.js receiver. These are video-backed environments, not orbitable architectural meshes.
- User explicitly approved the three layouts, lighting and scale and a 30-credit hard cap. Three generations cost **26.25 credits total** (balance 162.85 → 136.6). No retakes. One basement submission permission review timed out before job creation; its one permitted retry submitted the third and only basement job. Job records, prompts, references, spend and MP4s are in `assets/arenas-1`.
- Only the active room video is decoded. Hidden scenes pause; reduced motion uses the original still. Arena switches release the old video texture, source and frame callback. Runtime requires no Higgsfield account or API calls.
- Fighter setup now has actual body/weapon pictures, tier filtering and nine painted T3 family portraits. The workbench has visual family choices and explicit Front / Three-quarter / Side / Back views. Existing equipment and paint choices are preserved.
- Short pride sparkles, anger marks and alarm/sweat marks derive from recorded hits, parries, low core condition and limb breaks. Cooldowns prevent constant chatter. Brief contact bursts, simulation-sampled melee trails, actual projectile tracers and muzzle flashes improve readability. User-toggleable synthesized impact audio starts on a play gesture. This is a first expressive-effects pass, not a new facial rig or complete motion remaster.
- Following the user's additional request, a two-handed kit with one lost arm drops its disabled weapon and uses a short, lower-damage punch from the surviving hand. Both arms lost still ends the fight. The punch uses the same articulated hand pose for actual swept contact and rendering. It is unavailable with an intact two-handed weapon. Older engines and production rules are untouched; this changes the unfrozen version-8 practice rules only. Pre-change source snapshots are in `review/before-one-arm-backup`.

### Verification and limitations

- Zero study TypeScript diagnostics. 12,636 grip samples, 96 limb checks, 18 pose-clock checks, defence/conditional checks and 12 mixed fights pass under the new rules. Five matchups reproduce results, inputs and damage at 1/2/4 simulation steps per rendered frame. Current rules: `c5ff6ec4bb98c4b5`; motion: `ad13e11affcce5c9`.
- Backup punches physically connect with either arm missing across all seven two-handed kits on three T3 styles (42 cases), plus hammer/rifle on all three styles at T1 and T4 (24 cases). Disabled firearms produce zero shots in those checks. These isolated contact tests do not imply balanced one-arm matchups.
- Eight repeated fights preserve events, damage and GPU resource counts; phone/short-landscape, keyboard and reduced-motion checks passed. All three MP4s decode and advance in-browser. The main game-shell video also advances after fighter loading; external Google Fonts/analytics are blocked by this test environment. An early shell smoke attempt observed an unlocalized `Event`; a fresh load with proper readiness waits reproduced no page error.
- Unrecorded desktop measurement: median **16.7 ms**, p95 **16.9 ms**, Intel Iris Xe / Edge ANGLE Direct3D11, 1280×800 with animated arena and combat. Headless video recording adds overhead: approximately 33 ms/frame in the recorded check. No physical phone was available.
- Arena reviews are recorded under `review/arenas-1`. The Meshy/Blender room validator's mesh/opening/LOD requirements do not describe this 2.5D implementation; the adaptation is explicit in each brief. Do not report that generic mesh validator as passed, or claim these backgrounds support orbiting/free movement cameras.
- Competitive balance remains open. The earlier pairing report predates backup punches and is not a release report. No economy, ownership, Doma Reporter, shared accounting, cash-prize or production deployment changes were made.

Latest evidence: `review/arena-live-check.json`, `review/performance-current.json`, `review/backup-matrix.json`, `review/backup-tier-extremes.json`, `review/v8-verification.json` and `review/final-arena-smoke.json`. Browser videos are under `review/arena-live`. Local study/assets remain ignored by Git and must be deliberately packaged before any production release.


## 2026-09-17 - actual in-app browser video-loop repair

The user reported stationary arenas. Inspection in their actual Codex in-app browser exposed a looping deadlock: at the seek back to zero, readyState temporarily fell to 1; setMotion(true) called pause in its not-ready branch. The video then stayed at time zero despite the unconditional Animated arena label. The old server also served MP4 as application/octet-stream.

- Pause only when motion is disabled. Buffering and loop seeks no longer pause playback. canplay resumes after readiness changes; play promises are guarded and failures are exposed.
- Arena label now reflects actual playback/loading/error/reduced-motion state. Playback diagnostics are attached to the label, and the hidden active source video is removed on switch/disposal.
- Restarted only the verified localhost study server, applied video/mp4 headers, rebuilt and reloaded the user's tab. No new media generation or credits.
- Actual in-app browser observations after repair: Starship 1,663 presented frames (time 4.128593, playing, readyState 4); Colosseum 2,301 frames (time 0.06236, playing, readyState 4). Both passed numerous five-second loop boundaries while the fight was idle.
- Added viewer/check-arena-playback.cjs regression coverage: readiness at initial load, readiness drop at loop seek, hidden/resume, reduced-motion still and source/callback disposal. All pass. Study TypeScript check passes.

These are atmospheric loops with restrained distant motion, not a new crowd-animation rig. Visual intensity is a separate issue from playback. Balance, broader exchange choreography, main-game integration and physical-phone checks remain open.


## 2026-09-17 - purposeful exchanges, pass 5

User approved prioritising combat quality after the arena playback repair. The active local study now uses rules `546d408decb7ba8a`, motion `680c1fb3df3d119d`, presentation `3de80088695b378f`. Production and historical engines are untouched. This remains an unfrozen v8 practice candidate.

- Replaced constant circling with approach, angle-finding, holding ground, planted preparation/contact and threat-dependent recovery steps. Bursts record movement events. No invulnerability is added.
- Melee facing commits immediately before contact; attacks cannot keep rotating to follow a dodging rival. Recovery can turn again. Defence only responds during an actual incoming attack window, and dodges require both legs.
- Shorter follow-up gaps are earned by an exposed recovery or parry opening, with bounded exchange counts and full attack recovery retained. Greatsword/axe returning cuts now require a compatible preceding path. No damage or gear budget increases.
- Moving rifle shots retreat when crowded. Long stationary preparations are rejected at cramped range; moving/retreat actions and the compact arm-cannon direct shot remain eligible.
- Travel lean, burst crouch, Overdrive posture, directional hit recoil and block bracing are applied before hand IK. Weapon grips remain connected through body reactions. Existing knockdown lowering is retained.
- HUD movement language and impact explanations reflect actual decisions and contacts. Existing pride/anger/fear effects and physical detachment remain.
- Dropped two-handed equipment now chooses its resting orientation from its local bounds instead of a fixed rotation that could leave a hammer standing upright.

Validation: `review/exchange-5-quality.json` contains 18 complete mirrored fights on seeds 75, 917 and 2039, 42 one-arm fallback cases and 2,388 moving grip samples (maximum error ~3.3e-15). All complete before the time limit; each rifle sample fires. Existing v8 verification passes 12,636 grip samples, 96 limb checks, 18 scaled-pose checks, defence and conditional checks, 12 mixed fights, and identical event/damage replay under 1/2/4 step render grouping. TypeScript passes.

Actual in-app browser sessions exercised hammer/spear, Speed twin blades/rifle and greatsword/axe. The user began selecting additional builds during review, so their controls were left alone. No browser console errors observed. There is no newly recorded full-fight video artifact or measured performance run for this pass, and no physical-phone measurement. The previous performance report must not be presented as a new measurement. Broad 144-pair/all-tier balance and human visual approval remain open; these checks do not establish competitive fairness or spectator-quality approval.

Pre-change local source copies are under `review/before-exchanges-5`. Arena videos and the playback-loop repair remain intact; no paid generation, account, reward, shared accounting or Doma Reporter changes.

## 2026-09-17 - axe edge, visible atmosphere and exploratory balance

Current practice candidate: rules `c8abfd0df11ae1d3`, motion `f066fab0e2aa7b8a`, presentation `30e4b57f72d4a1c0`. The user approved the exchanges except the axe turning backwards before its sideways strike.

- Corrected only the axe cross-strike roll so its single cutting edge leads the actual swing. Preparation and return blend smoothly; the other approved axe paths are unchanged. `review/axe-edge-review.json` checks 108 cross-strike samples over all 36 body variants: positive edge/velocity alignment and maximum support-grip error about 1.15e-15.
- The user's actual browser confirmed video playback and advancing frames, but the generated motion was too restrained. Added a local, bounded atmosphere layer over the original Higgsfield videos: drifting illuminated fragments and rim light for Starship; movement confined to the central cloth banners and brazier embers for Colosseum; overhead steam and worklight variation for Underground. No new generations or credits. These are shader effects on video plates, not independently simulated crowds or orbitable rooms.
- Added an Arena motion checkbox for direct comparison. Ambient rendering now continues smoothly while fighters are idle. Reduced motion and hidden scenes disable animation; arena switching/disposal releases video and shader resources. A first cloth mask visibly distorted masonry and was corrected to the two central banner regions before delivery.
- Verified all three arenas in the actual in-app browser with no observed WebGL errors. Playback-loop, loading, hidden/resume, reduced-motion and cleanup regressions pass. TypeScript has zero diagnostics. Fresh final-rule verification passes 12,636 grip samples, 96 limb checks, 18 pose-clock checks, defence/conditional checks, 12 mixed fights and five deterministic replay comparisons under 1/2/4-step grouping.
- Current browser idle observation with animated background: median 16.7 ms, p95 16.9 ms; 349 geometries and 67 textures. This is an idle desktop browser sample, not a new full combat or physical-phone performance certification. Responsive DOM bounds fit 390x844 and 844x390, including motion controls; physical-phone testing remains unavailable.

Balance remains exploratory and unfrozen. The first 144-fight diagnostic included a temporary broader axe experiment that was reverted; do not treat it as a clean isolated baseline. The next 288 T3 fights on seeds 75/2039 informed damage tuning, so those seeds are now tuning data. Latest separate seed 3917 covers all 144 ordered T3 weapon pairings. Correct per-side counting includes both sides of mirrors (24 appearances per kit): hammer 41.7%, greatsword 58.3%, axe 54.2%, flail 50.0%, sword/buckler 37.5%, spear/shield 66.7%, two-handed spear 33.3%, dual blades 45.8%, rifle 41.7%, precision rifle 50.0%, rotary 66.7%, arm cannon 54.2%.

That fresh-seed run DOES NOT pass the release balance gate: four kits fall outside the 40-60% overall target, side wins are 79/65 (9.7 percentage points apart), and arm cannon versus hammer reaches the 7,200-tick limit after both lose their right arms. One seed cannot establish individual matchup fairness; broader held-out seeds, all-tier coverage and the remaining-arm endgame need further work. Evidence is in `review/balance-tuning6-t3.json` and `review/balance-tuning7-heldout-t3.json`. No GP, economy, production, historical engine, ownership, Doma Reporter or shared accounting changes.

Final in-app smoke: the user's Revenant/greatsword versus Harrow/axe seed-75 match completed uninterrupted in 50 simulation seconds (axe won); the Colosseum video continued beyond 5,400 presented frames with the atmosphere enabled and no console warnings/errors. This is a functional complete-fight check, not human visual approval.

## 2026-09-17 - fair decisions, fallback combat and item stats

The user approved the current arena visuals, asked to continue, then specifically required item stats to affect actual combat and full T2 builds to overwhelmingly beat full T1 builds. Current local candidate: rules `1a59ac81dc47121f`, motion `f066fab0e2aa7b8a`, presentation `ce6d6d01a23d91dc`. No approved meshes, weapon paths or arena assets changed during this pass.

### Combat fixes and explanations

- Disabled one-handed kits now use the surviving-arm punch too. Previously an arm cannon with its weapon arm gone still tried to maintain firing distance without being able to fire. All 54 applicable style/kit/arm-loss checks connect physically, and disabled mounts cannot fire later in the same tick.
- Removed the fixed 11-tick starting advantage for screen-side zero. Both actors now decide against the same pre-movement/pre-choice opponent state. Same-tick contact priority alternates deterministically. This does not force a particular winner or add a side handicap.
- Short melee attack admission now accounts for body clearance, while actual swept geometry still decides contact. Previously 16 of 144 tested mixed-body samples could physically reach but were prevented from starting an attack. All 144 now start and physically connect. Sword/buckler approaches slightly closer to its useful range; models and physical separation stay intact.
- Added an optional post-fight **Fight breakdown** with damage, hits, held-shield blocks, recovery hits, fallback punches, specials, lost limbs and timestamped moments from recorded events. No inferred causality, made-up accuracy percentages or invented events. Watch again uses the existing deterministic replay path.

### Authoritative preview item statistics

`viewer/equipment-stats.ts` now owns slot-specific `mk8-items-1` values. The parts screen and `build8` use the same aggregation. Snapshots carry the item-stat version, canonical per-slot values and resulting totals; the rules digest includes the stats module. Family appearance and paint give no hidden bonuses.

- Legs and body mobility set movement speed; head stats set turning and precision. Precision narrows actual projectile error, with no second random miss after physical contact.
- Arm handling and weapon handling set attack speed. Preparation, active contact and recovery advance using that rate; the follow-up delay scales too. Overdrive and Slow Field compose with it, while the match clock and five-second special duration remain unchanged. Defensive timing accounts for the rival's real action rate.
- Arms and the weapon contribute power. Part health is separate from physical armour. Armour ratings combine with fixed slot weights and a 35% reduction cap, so adding armour actually reduces incoming damage rather than merely increasing a health bar.
- Guard capacity/regeneration scale with equipment durability. Interruption thresholds scale with starting body health, avoiding a fixed damage threshold that would make high-tier exchanges behave differently merely because all numbers got larger.
- Tier health factors are 1 / 1.85 / 2.85 / 4; weapon damage factors are 1 / 1.7 / 2.5 / 3.4. Mobility and handling grow more gently, retaining style trade-offs. These remain preview tuning values.
- GP remains the sum of the seven installed items. Full T1/T2 are 100/200 GP; replacing only the T1 body with T2 gives 120 GP. There is no highest-tier shortcut or automatic tier-winner rule.
- Robot totals appear in the left preview panel; the right item panel shows its stats and positive/negative projected changes on hover or keyboard focus, including separate part health. The phone layout collapses the left panel. Earlier saved weapon previews are kept and receive a clear prompt to choose a practice kit; fresh workbenches start with a compatible kit. Fitting a weapon preserves body choices.

### Verification and remaining gates

`review/item-stats-10.json` verifies actual movement, action duration, damage reduction, projectile error, turning, mixed-tier aggregation and paint isolation. Controlled examples: one Tank leg replaced by a Speed leg increases travelled distance from 1.160 to 1.600 units over 45 ticks; one faster arm reduces a complete hammer cycle from 88 to 77 ticks (110 under Slow Field, 64 under Overdrive); replacing one light arm with an armoured arm reduces a 100-point raw physical hit from 92 to 90.75 damage. A T1/T2 full Tank has approximately 201/371 body health and 18%/22% physical damage reduction.

Tier progression evidence: `review/tier-progression-10-summary.json` and its three source files. Full T2 won **287/288** fights covering every ordered weapon pairing and both sides; a separate fresh-seed subset covering T2 hammer, sword/buckler and rifle against all T1 kits won **69/72**. Combined: **356/360 (98.9%)**, zero time limits. Both participants used automatic special policies and started at full strength. This is an observed test result, not a guaranteed probability; manual play, mixed tiers and all adjacent higher tiers need broader coverage.

Final-rule verification passes 12,636 grip samples, 96 limb checks, 18 pose-clock checks, defence/conditional checks, 12 mixed fights, five deterministic replay comparisons and the 54 fallback cases. TypeScript, report attribution/immutability, and arena loop/cleanup checks pass. Actual browser review covered desktop stats, keyboard comparisons without fitting a part, report replay and Escape focus return, and 390x844 / 844x390 bounds. One existing PMREM roughness-sampling warning remains in the workbench; no new UI runtime error was observed. Physical-phone performance remains untested; no new 60/30 FPS claim is made.

Before the item-stat change, a 576-fight all-tier sweep exposed sword/buckler weakness and rotary strength; subsequent spacing checks covered 236 more fights. Those reports are preserved in `review/balance-9-summary.json`, but **they predate the new item stats and are not balance certification for this candidate**. Equal-GP weapon balance and competitive release approval remain open. The next balance pass must use the new stats and include manual-attacker/automatic-defender policies, mixed builds and held-out seeds.

Everything remains in the isolated local practice/workbench. No production deployment, economy/price changes, ownership migration, historical-engine rewrite, Doma Reporter, shared accounting, cash-prize changes or paid generation occurred. Local study files remain ignored by Git and need deliberate packaging before integration.

## September 17: stable item comparisons and physical shield guard

The supplied 6.88-second recording showed a hover feedback loop: changing the comparison's height moved its triggering tile, causing another enter/leave and moving the menu again. The comparison now has a fixed 188px box with its own scrolling and keyboard focus. Leaving a tile retains the last inspected part so the comparison can be read. Repeated fitted/candidate focus changes kept panel height, shelf position and sidebar scroll identical (188 / 407.5 / 558px). Phone 390×844 and short landscape 844×390 were visually checked; phone content width remained 390px. No equipment was fitted during verification; the viewport override was reset. Evidence: `review/menu-recording.jpg` and `review/menu-stability-11.json` under the local study.

Continuing the item-stat balance pass exposed a physical shield problem. Guard previously added torso bracing without raising the shield, and the visible hand could receive a frontal hit before the shield face. The version-8 practice pose now raises the shield toward the centre over five simulation ticks and lowers it over seven. The new kit mount clears the fingers by 0.18 scene units along the palm normal; legacy non-kit assets retain their mounts. The same pose feeds rendering and collision. Knockdown, lost arms and fallback punches cannot retain an active shield block. No damage or tier multipliers changed in this pass.

Current candidate: rules `e97da3b4ef5a1fd9`, motion `4794f129a19e81cd`, presentation `2a7b371462972892`. `review/shield-guard11.json` checks all 24 combinations of two shield kits, four tiers and three body styles: reachable grips, raised centre coverage, actual frontal ray contact before the hand, guard expenditure/exhaustion and missing-arm exclusion. Full verification again passed 12,636 grip samples, 96 limb cases, 18 pose timing checks, 12 mixed fights and five replay comparisons across frame batching. Item-stat, fallback, type, arena playback and fight-report checks pass. Browser inspection verified the raised guard and a completed fight/replay; this is not a claim of full visual approval or measured device performance.

`review/balance-guard12-t3.json` contains 288 equal-GP T3 fights covering all 144 ordered kit pairings on seed 13007 and fresh seed 24683. All finished without time limits. Balance is **not approved**: sword/buckler won 9/48 appearances (18.75%), long spear 16/48 (33.3%), twin blades 33/48 (68.75%). Combined first/second-side wins were 157/131; the fresh seed alone was 73/71. These small seed samples identify work, not reliable pairing probabilities. Next: investigate short-weapon action selection, shield-check reach and useful counter windows, then retest tiers, mixed builds and separate held-out seeds. Do not paper over these failures with matchup selection or a tier-winner override.

The changed shield kits also received a fresh progression check: T2 sword/buckler and spear/shield against all twelve T1 kits, mirrored sides, 48 fights. T2 won 47/48 (97.9%) with no timeouts (`review/tier-progression-guard12-shields.json`). This preserves the intended strong tier advantage in the affected subset; the older 360-fight result is not a full rerun of this motion version.

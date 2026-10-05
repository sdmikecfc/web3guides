# Reactor Pit — local playable candidate

Open **http://127.0.0.1:3192/bots/pit**. Pick a free fighter, choose the rival and difficulty, then enter the pit. **Learn the moves** opens training. Your workshop's Fight screen also offers **Reactor Pit · Take control** for the selected robot.

This is practice. It awards no coins, repairs, records or competition points. Automatic fights, saved equipment, trading and historical replays keep their existing paths.

## Restart the local preview

From the existing web3guides folder, run:

```powershell
& 'D:\Temp\modelkombat-node-runtime\node.exe' scripts/bots/start-reactor-pit.cjs
```

The launcher uses the existing D-drive dependencies and a separate D-drive preview. It does not install packages, move the source checkout, update a database, push Git or deploy. If port 3192 is already serving the preview, use the running page.

Production remains the user's own `vercel --prod`. A local build or Git push does not publish this mode.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move / crouch / jump | A, D / S / W or Space | Eight-way pad |
| Light / Heavy | J / K | Light / Heavy |
| Special / Guard | U / hold I | Special / hold Guard |
| Throw / escape throw | L | Throw |
| Super | O | Super |
| Enhance next Special | E | Enhancement toggle |
| Escape enemy combo | R, with three energy | Contextual Escape |
| Dash | Shift + direction, or double tap | Double tap or Dash |
| Finish | F during the final prompt | Finish |
| Pause | Escape | Pause |

Mouse on the arena: **left click Light, hold right click Guard, click the wheel Heavy**. Keyboard controls remain available alongside the mouse. Arrow keys are movement aliases unless explicitly remapped. Attacking deliberately lowers held Guard until recovery ends; the held button resumes protection afterward. Menus keep their normal mouse behaviour. The visible Light, Guard, Heavy and Weapon buttons can also be used directly.

Directions for modified attacks are relative to the opponent. Down + Light is low; Down + Heavy launches; Forward + Heavy is overhead. Release attack buttons between presses. Holding does not automate a string. The confirmation cue shows legal follow-ups after an actual hit.

Settings save locally: bindings, touch layout, volumes, graphics, shake and reduced effects. Losing focus or rotating pauses play and releases held controls. Resume explicitly.

## What this candidate implements

- Independent `mk10-pit-3` 60 Hz engine; pinned build, paint, motion contacts, muzzle coordinates, commands and seed in local replays.
- Heavy, Agile and Ranged loaners; owned builds; equal-GP opponents; three AI difficulties without damage bonuses.
- Eight normals, twelve kits' two signatures, three body specials, throws/escapes, enhanced specials, supers and optional five-second finishers.
- Standing/crouching guards, finite guard, physical jumping, one pending buffered action, hit-confirmed cancels, combo scaling and bounded relaunches.
- Best of three, 90-second rounds, energy carry, simultaneous contacts and drawn rounds.
- Approved articulated assets, grip solving, weapon stow/draw, distinct reactions, cosmetic wear and finisher-only component separation.
- A 3D reactor platform with low boundaries, drones and steam, backed by the existing animated industrial arena artwork. Reduced motion and Low graphics use its static poster. Existing music plus procedural impact audio.
- Training dummy policies, unlimited energy, reset, quarter-speed motion review, input history, contact display and build-specific combo verification.

Contact paths are sampled from assembled hands, feet and weapon markers before the fight. Rounded samples and muzzle positions enter the replay packet. Render frame rate cannot choose contact or damage. Ordinary simulation rules and server reward settlement are not imported into this engine.

## Verification and honest limits

42 automated checks pass, as does the focused TypeScript check. The clean D-drive production build passes; this is not a production deployment. The checks cover guard levels, throws, action buffering, simultaneous contacts, three core combo routes, equipment replacements, energy, round flow, finishers and replay results at 30/60/120 render schedules. `scripts/bots/check-reactor-pit.cjs` runs them; `--types` checks the mode's TypeScript. `scripts/bots/probe-reactor-pit.cjs --matrix` compares two scripted policies across nine style matchups. Scripted players do not establish human enjoyment or difficulty balance.

Browser review uses 1280×720, 390×844 and 844×390. These are desktop viewport tests, not physical-phone tests. A full losing match, round transitions and rematch were exercised. Touch presses, portrait-to-landscape pause, the keyboard/touch prompt change, and the focus-trapped move list were exercised. The actual assembled T1 starter strings verify at 20% Heavy, 23% Agile and 21% Ranged damage against equal equipment. Initial desktop sampling: about 16.7 ms median and 18.2 ms p95 over 600 rendered frames. Host: Intel i5-11300H; Intel Iris Xe and NVIDIA GTX 1650 installed. The sampled active GPU was not identified. Development compilation can disrupt these numbers.

**Still needs approval and testing:**

- Five actual newcomers and physical Android Chrome / iPhone Safari have not been tested.
- The current model-calibrated probe covered six seeds across nine starter matchups on Normal: repeated-Light play won 3/54, while a defensive combo policy with delayed opponent observations won 48/54. This is a limited scripted comparison, not a human difficulty or balance certification; mixed-kit and human review remain necessary.
- Animation and finishers are procedural first passes, not newly authored Blender clips. Full-body footwork, mixed-kit stow transitions and finisher staging need visual approval.
- All twelve kits have action definitions; exhaustive visual/contact review of every mixed assembly and tier is not complete. The move list only advertises combo routes that pass the currently assembled build's drill check.
- Banners and appearance details outside paint are not reproduced in this mode. Earlier workshop appearances remain intact.
- Local replay viewing is implemented; public sharing and server-verified competitive inputs are outside this practice release.

**Do not call this gameplay-approved or launch-ready from passing tests alone.** The user must be able to play complete touch and keyboard fights and enjoy the decisions before the gameplay gate closes.

## Animation foundation reset — September 30

The user rejected the previous motion: crossed arms, backhanded punches and inverted kicks. Previous reach/grip checks did not catch anatomical failure and do not establish visual quality.

The new `mk10-reactor-2` presentation replaces the unarmed pose layer. It starts from an opt-in anatomical bind, with explicit limb hinge frames, consistent forward knee flexion, forearm-aligned hands and separately authored load, extension, retract and settle phases. A jab uses the lead hand; kicks keep the other limbs in guard. Fist and sole surface markers now supply normal-attack contact samples. The shared assembly's default weapon stance remains unchanged; historical modes do not opt into the new bind or brawling poses.

**Learn the moves → Review movements** pauses simulation and inspects the actual sampler from front or side. Guard, jab, heavy, front/low/air kicks, uppercut and overhead can be scrubbed, played slowly or held at contact. Resume leaves inspection and returns to live practice. This is an inspection tool, not evidence of a completed fight.

`check-pit-anatomy.cjs` checks 1,974 poses across the three starters and a mixed-limb assembly: uncrossed guard, elbow placement, hand alignment, positive knee flexion and toe/sole orientation. It also verifies the basic combo against contact samples from the real assembled geometry. The same calibration function runs in the browser; it cannot quietly test a longer generic reach instead.

The scope of this reset is the motion foundation. Weapon transitions still use the previous kit solver. Hit-reaction transitions, footwork, throw choreography, supers and finishers still require deliberate animation work and full-match visual review. Do not expand content or declare the mode ready because the new guard/punch/kick proof passes. The next acceptance gate is a readable, responsive full exchange with movement, block, punish, miss and recovery, followed by complete touch and keyboard fights. Physical phones and new-player testing remain outstanding.

## Mouse and weapon repair review

The previous candidate omitted canvas mouse bindings, drew a duplicate weapon straight through the torso, and paused on any frame longer than 250 ms. The repair adds native multi-button mouse handling, restores Space jump, focuses combat on resume and shows current action readiness instead of a stale rejection. Focus loss still pauses; an isolated rendering hitch consumes a bounded time slice without pausing the game.

Weapons now use a single unchanged mesh, a body-bounds-based back mount and a shoulder-side draw. The drawing hand follows that mesh; the support hand joins in front. No duplicate grip or muzzle markers exist. Back mounts and finite grip poses were checked through both signature actions for all 36 T1 body/kit combinations with `scripts/bots/check-pit-rigs.cjs --all`. This is a mounting/reach check, not an exhaustive mesh-intersection or visual certification of every tier.

Actual browser input review confirmed left-click Light, middle-click Heavy, right-button commands, keyboard strikes and a Ranged shot that damaged the dummy. Mouse chords, outside releases, missing mouse-up recovery and paused-input suppression also have regression checks. Physical-phone testing remains outstanding.

## Punch reach repair — September 30

The user reported that punches were too short and the match impossible. The previous jab rooted the fighter in place; the cross could reach less far than the jab. The previous contact clip also reached full extension before the active frames, allowing close opponents to be passed over. The old basic-string check started at a 1.2-unit centre gap and failed to expose ordinary-spacing problems.

`mk10-pit-2` / `mk10-reactor-3` coordinates a bounded root step, planted lead foot, shoulder rotation and extending fist. Contact begins during extension. Neutral Light steps 0.38 units; Forward + Light is an explicit 0.82-unit stepping jab. Heavy follows through with a longer step and extension. Neither move homes toward an opponent or enlarges its existing hit radius. Root movement and fist samples are deterministic and replay-pinned. Retreats, crouches, guards and committed misses remain effective.

Training begins at normal punching distance, and its unlimited energy applies only to the player. The readiness prompt distinguishes punching range from a gap that requires an approach. Mouse Light and Heavy were exercised on the Ranged starter against Agile in the browser; both produced recorded contacts and visible health loss.

`check-pit-reach.cjs` verifies 144 real-model normal-attack contacts across all three starter pairings, both facing directions and gaps from 1.1 to 2.5 units. It additionally checks far misses, retreat, crouching, guarding, Forward + Light entry, 20–23% three-hit strings at a 2.5-unit gap, and calibrated replays at 30/60/120 render schedules. `probe-pit-reach.cjs --matches` runs the scripted comparison above. Anatomical coverage is now 1,982 sampled poses. These checks establish the repaired contact behaviour, not final visual or gameplay approval.

## Mouse and movement interactions — September 30

The reported match did record mouse Light and Guard presses, but guard/attack rejection, lost guard holds after jump/dash, and direction-dependent follow-up substitution made those inputs unreliable to use. `mk10-pit-3` preserves physical holds through combat actions. A held guard is inactive during attacks, dashes, jumps and hitstun, and resumes when legal; attacking does not silently disappear behind a held mouse button. There is no guarding during attack startup or dash travel.

Back + Light uses a short retreating jab instead of pulling the fighter forward. Back + Guard retreats at 55% walking speed. Directional jump momentum continues through aerial attacks. Forward can remain held through a manually entered Light → Light → Heavy string; a follow-up Heavy no longer becomes an uncancellable overhead. Neutral Forward + Heavy remains the overhead. A single six-frame follow-up buffer can wait for actual contact, expiring on a miss or block; it cannot automate a string or stack button presses.

Desktop buttons identify **Left mouse**, **Hold right mouse**, **Click wheel**, and **Weapon / U**, and briefly acknowledge received presses. Readiness and rejection feedback distinguish recovery from a missing input. Clicking these on-screen controls with a mouse keeps the desktop layout. Guard also has a more distinct braced pose.

42 combat/control regressions pass, including native mouse-event chords routed through the engine, attack vulnerability while Guard is held, reblocking after jump/dash, retreat direction on both sides, aerial movement and manually entered moving strings. The real-model reach and replay checks still pass. The calibrated Normal-difficulty scripted comparison remains 3/54 wins for repeated Light and 48/54 for the measured policy; this does not establish human enjoyment or physical-device behaviour.

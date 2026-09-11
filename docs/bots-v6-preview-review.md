# Model Kombat v6 preview checkpoint — 12 September 2026

This is the first hero/contact review in the approved release order, **not a production release**. The complete six-family visual catalogue and frozen balance approval are outstanding. Nothing in this checkpoint applies the staged SQL or enables a live season.

## Review the local game

- `/bots?view=fight&combat=6&style=speed&rival=tank&seed=75` — paired-blade arm/contact practice.
- Use Robot & fight details to choose the Tank, Speed or Ranged T3 hero; all have 350 GP. One prominent Special button controls the player; the rival uses its saved policy.
- The Season preview contains the isolated shop, build comparison, active stands, repairs, records and archived collection interface. A configured server season is required for enrollment and purchases; missing rules/migrations fail closed.
- All fight entry routes and Community stay in the game shell with persistent navigation. Show me around does not reset ownership or award coins.

The concrete three-hero lineup and side/three-quarter Blender renders are in the task workspace `outputs/v6-hero-review`. Human approval of those proportions/materials and actual contact is pending before bulk visual production. Public review GLBs are original local Blender work; no paid assets were generated.

## Sword/arm correction

The renderer used separate weapon motion from the arm rig. It now takes upper-arm, elbow, hand and weapon transforms from the same bounded two-link pose used by the v6 collision engine. Actual blade edge capsules sweep against posed body/limb proxies; the weapon cannot move independently or stretch an arm to reach a target.

Rig lookup uses the original Blender node identity preserved by GLTFLoader, including exporter-added numeric suffixes. Both hands, mixed family limbs, cannon aiming and dual Special pistols use actual exported attachment geometry. Fist shoves hide the held weapon for that action. Limb loss disables that limb's weapon. Camera framing includes visible weapons and gently follows across the combat axis; steady/reduced-motion views hold their chosen angle.

Recorded impacts deform each robot's own clay buffers. Protected machinery stays intact. Damage reconstructs from events, stays on a detached limb and resets positions/normals exactly between replays. Scorch marks use surface colour without a false physical dent.

## Verification evidence

- Full project TypeScript check passed after the final bounded tuning checkpoint and shell fixes.
- Actual GLB verification: 12 groups, including 455 sampled attack/recovery poses, 300 mixed-family simulation ticks and 63 dual-pistol burst poses. Actual hand/grip disagreement below 0.0002 mm; arm lengths remain fixed. Muzzle transforms, arm loss, dent isolation, replay/reset and single disposal pass.
- Browser captures: actual deterministic paired-blade preparation, contact and recovery; no page errors or unexpected API access. A short actual browser recording is in task `outputs/v6-renderer-qa/contact-motion/paired-blades-contact.mp4`. This is a software-browser capture, not a performance measurement or marketing trailer.
- UI checks at 1280×720, 390×844 and 844×390: persistent navigation, no viewport overflow, modal focus/Escape and compact shop. Sixteen desktop items and nine complete phone tiles; failed draft/Finish retries keep choices and request IDs.
- Isolated season database/API checks: 17 backend groups, five playback groups, five MCP-intake groups; catalogue SQL exactly matches 135 canonical cards. Focused sign-in checks use synthetic real EOA signatures and isolated nonce storage: five groups pass, including replay races and no legacy starter enrollment.
- Earlier v5 replay/movement baselines remain unchanged in the compatibility suite. Exact commands and scope are in `bots-season-v6-review.md` and the task lane reports.

## Remaining acceptance work

1. Human review of the three T3 heroes and contact, followed by the remaining families/tiers and weapon art. Unauthored catalogue equipment is explicitly pending; finished old robots are never substituted with a new random hero.
2. Final balance on separate training/held-out seeds, all tiers, hybrids, signature combinations and defender policies. The reduced 96-match T3 diagnostic fails: Speed wins 100% of training matches and 93.75% of held-out matches against Ranged. Tank/Ranged held-out is 25%; training side bias is 6.25 percentage points. These fail the approved gates. See `bots-v6-contact-checkpoint.md` for exact settings, seeds and remaining matrix. V6 rules remain unfrozen.
3. Shared physical root/leg poses for full knockdown/get-up and moving-leg animation. Current preview keeps those proxies and meshes aligned upright during control effects; it must not be presented as finished cinematic motion. Camera contact/denting can still be obscured by a far-side strike.
4. Physical desktop/mobile performance measurement, unavailable physical-phone testing, real-wallet end-to-end verification, and a browser-injected per-visitor load-failure test.
5. Review and apply game-only additive migrations, explicitly configure/freeze the next season, then enable ranked preview/launch. No active-season rules, existing inventories, cash-prize formulas, shared accounting or Doma Reporter changes belong to this checkpoint.

Authoring and test scripts are checked into the game repository. Large Blender working scenes, contact recordings and expanded local test evidence remain in the task workspace.

Run `node --preserve-symlinks --preserve-symlinks-main scripts/bots-v6-renderer-check.cjs --repo` for the actual-model arm/damage regression. It creates its report and transpiled runtime module in an isolated temporary directory; it does not start a browser or contact services.

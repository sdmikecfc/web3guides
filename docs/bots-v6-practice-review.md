# Model Kombat practice review — 12 September 2026

The visual and interface correction is complete. The current v6 combat candidate is suitable for a **practice review, with ranked play and new seasonal enrollment disabled**. It is not an accepted competitive release.

## Finished in this pass

- Restored complete toy limbs, expressive faces and softer painted materials across the catalogue. Kept metal weapons and the three readable fighting styles.
- Corrected weapon carry and shared arm/weapon posing. Actual renderer checks cover grips, muzzles, independent dents and mixed parts.
- Preserved exact browser drafts through wallet connection. Older or inconsistent saved proofs cannot silently become current robots in practice, shop comparisons or replays.
- Fixed phone arena clipping, collection practice, seasonal Community scores and the local fonts used by game/share cards.
- Released scene-owned GPU buffers and shadow targets when leaving fights. Same-canvas reuse and repeated replay/disposal pass.
- Improved ordinary weapon budgets and recorded the correct source of burn damage. Colours, GP, prices and canonical part-stat tuples remain unchanged.

## Verification

The frozen AB simulation passes 52 mechanical/status/replay groups and strict TypeScript. Its legal-weapon diagnostic covers 1,368 mirrored fights without timeouts. The repository differs from that tested simulation only by an ASCII correction to one documentation comment. Exact source hashes and the 22-file copy receipt are in the task's `outputs/v6-ready/AB-review-source.json` and `AB-repo-copy.json`.

The preceding Z renderer measured 60 FPS on an NVIDIA GTX 1650 in six eight-second desktop/phone-viewport fight samples and both five-robot garage samples. Geometry is unchanged in AB, but its revised weapon timing was not part of those measurements. Phone viewport emulation is not physical-mobile testing. Repeated replay counts stayed stable; the later teardown fix also passes a real Garage navigation test with no further old-context draws.

Current production-build, HTTP and controlled wallet verification belong to the separately labelled standalone package under the task's `outputs/season-release`. Refer to that package's current `READY-FOR-REVIEW.md`; do not substitute an earlier build log for its final source.

## Why ranked remains disabled

The broad Tank/Speed/Ranged averages passed the earlier reference checks, but they hid severe T1 family differences. Scrapyard won all 128 sampled fights against Spring; Boiler won only 12 of 128 against Owl. A bounded investigation found compounding durability, plating, guard, movement and shape tradeoffs, rather than a simple unreachable-attack bug. These families need calibration before their gear budgets can be called fair.

AB removed the worst ordinary twin-blade and shotgun extremes. Some weapon/style subgroups still need review. Neither a complete AB training bank nor fresh held-out validation has run. A full pair of banks contains 12,336 reported fights and previously measured throughput suggests roughly 80–100 minutes, after a corrected candidate is chosen. No long bank is running in the background.

## Release boundary

The standalone review must keep `BOTS_SEASON_V1=0`; no new seasonal enrollment, ranked sessions or rewards are enabled. The source ZIP contains no production credentials or live configuration. Hosted game-only migrations, grants, new-season dates, real wallet providers, domains and collector readiness still require their documented release review.

Existing robots, earlier combat engines, active seasons, cash-prize formulas and shared accounting remain unchanged. Doma Reporter was not modified. No deployment, hosted SQL, paid asset generation or live enrollment occurred.

The detailed domain evidence is `outputs/v6-ready/AB-HANDOFF.md` in the task workspace. The actual revised T3 lineup is `outputs/v6-lineup-final/model-kombat-three-styles-t3.png`. All paths are beneath `C:/Users/Mike/Documents/Codex/2026-09-07/i-b` unless explicitly marked as repository paths.

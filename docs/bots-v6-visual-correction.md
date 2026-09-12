# v6 toy correction — 12 September 2026

This is an unreleased visual correction. It does not certify final combat balance or enable a season.

The new catalogue had lost the complete forearm/shin assemblies and expressive eyes that made the earlier toy robots appealing. Automatic weapon roll also pulled hands up across faces or left swords pointing down behind their arms.

## Changes

- All 24 family/tier body models retain complete forearms, thighs, shins and boots. Higher tiers add armour and mechanisms to a complete lower-tier toy.
- Early Tank heads have ivory eyes and pupils. The Boiler Knight's T3/T4 helmet keeps visible focused eyes under a sculpted visor, replacing the large gold eye/brow bars.
- Painted shells use lower metalness and a softer finish. Metal weapons, brass fittings and lenses retain their distinct finishes. The last face/material pass preserves the exact canonical collision shapes and joint attachments.
- Hammer paths now explicitly control weapon roll and stay within the real arm reach. Sword carry uses a continuous upright reference that blends out before contact; active blade contact paths remain unchanged.
- Idle cannon kits hold their actual backup weapon at the right hand instead of leaving it at the exported origin.
- Partial-build previews use a relaxed arm pose until a weapon is fitted. Isolated part pictures and saved-build photographs use the actual admitted catalogue models.
- The five seasonal garage stands share one scene, floor, camera and lighting. The game font is self-hosted under its SIL Open Font License.
- Shoulder cannon kits now follow the agreed progression: Tier 3+ and a matching Ranged body. The early Tier 2 cannon proof remains archived on disk; it is absent from the playable catalogue and runtime card admission. Retained items keep their IDs, stats, Gear Points and prices.

The new assets are in `public/bots-art/3d/season-v6/catalogue-1/`. The authoring source is `scripts/bots-v6-author-catalogue.py`; the public source manifest records the file hashes. Earlier toy assets and combat versions 2–5 are unchanged.

## Verification

- 63 GLBs and 135 card pictures authored; 134 cards remain active after archiving the early cannon proof. All canonical attachments and finite geometry validated. Maximum model size: 99,408 triangles.
- Actual-GLB renderer checks pass 13 groups: joints, weapon grips/muzzles, all six families across four tiers, every weapon, mixed limbs, Special sidearms, independent dents/scorches, deterministic reset and resource disposal.
- Same-camera front and three-quarter images were compared before admitting the helmet/material change. Actual Tank/Speed preparation, contact and recovery were captured in the game renderer.
- Fresh welcome, returning drafts, failed/empty Community data, practice start and persistent phone/desktop navigation pass. Existing saved choices remain unchanged.

## Still under review

Some ordinary sword contacts are hidden by the near robot's shoulder. Broad flat shell transitions can show faceted shading. The isolated Z production build and wallet proof pass, but the wider weapon bank rejects its balance. The replacement simulation needs acceptance, a coherent rebuild and hosted configuration review before release.

The P1 checkpoint was measured separately on the development desktop with an NVIDIA GTX 1650 using Chromium's ANGLE/D3D11 renderer. Eight-second hammer-versus-paired-blades samples at 1280×800 and 390×844 both rendered at 60 FPS, with p95 frame intervals of 16.8/16.7 ms and no intervals above 33 ms. The phone-sized sample used the same desktop GPU; it is not a physical-phone performance result. Both samples had zero page/API errors and zero measured weapon-grip error. Evidence: `C:/Users/Mike/Documents/Codex/2026-09-07/i-b/outputs/v6-performance-review/p1-quiet/report.json`. Later combat tuning still needs a final coherent performance check. Physical-mobile testing remains unavailable.

The shared garage also held 60 FPS with five mixed current robots on that desktop GPU, at 1280×800/DPR 1 and 390×844/DPR 2. Both eight-second samples had one canvas, correct floor contact, no horizontal overflow or page errors, and no frame intervals above 33.4 ms. A synthetic hidden-state check stopped all drawing. These were read-only API fixtures and phone viewport emulation, with no live garage writes or physical-mobile claim. Evidence: `C:/Users/Mike/Documents/Codex/2026-09-07/i-b/outputs/v6-performance-review/garage-current/REVIEW.md` and `report.json`.

A bounded camera study retained this limitation rather than hiding it with an unproven camera change. It compared the current camera (vertical component 0.39, across-axis offset +0.12 radians) with three candidates (0.55/+0.30, 0.62/−0.30, 0.62/+0.30). The actual Speed/sword versus Tank/hammer Tier 3 fight, seed 75, frame 137, had identical complete-state hashes in all twelve captures. The near Tank shoulder/torso still obscured the sword's torso contact; higher views made figures smaller in the 183-pixel-high landscape arena. Both full robots remained framed at desktop, phone and short-landscape sizes. The current production camera is unchanged. Evidence: `C:/Users/Mike/Documents/Codex/2026-09-07/i-b/outputs/v6-camera-study/README.md`, `report.json` and the twelve `[viewport]-[camera].png` captures. This was a visual study, not an FPS benchmark.

The later frozen Z simulation was measured on the same GTX 1650 with heavy workers paused. Hammer/blades, rifle/hammer and flame/blades each rendered at 60 FPS in both desktop and phone-sized layouts: six eight-second samples, p95 frame intervals 16.7–16.8 ms, JavaScript callbacks 3.5–4.2 ms, no frame gaps over 33.4 ms and no page/API errors. Independent dents remained visible and the three replay resets kept resource counts stable. Flame's fallback after gun-arm loss reported a 146–280 mm requested-pose reach clamp; that is not a measured gap between its hand and weapon and remains under pose review. The same checkpoint's five legal mixed garage robots rendered at 60 FPS in both layouts with one canvas, correct support, no overflow and zero draws in the synthetic hidden-state branch. Exact hashes, screenshots, raw samples and limitations are in `outputs/v6-performance-review/z-quiet/report.json` and `outputs/v6-performance-review/garage-final/report.json` under the task workspace. These controlled desktop measurements do not establish physical-mobile performance or final combat balance.

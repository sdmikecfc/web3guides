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

The new assets are in `public/bots-art/3d/season-v6/catalogue-1/`. The authoring source is `scripts/bots-v6-author-catalogue.py`; the public source manifest records the file hashes. Earlier toy assets and combat versions 2–5 are unchanged.

## Verification

- 63 GLBs and all 135 card pictures admitted; all canonical attachments and finite geometry validated. Maximum model size: 99,408 triangles.
- Actual-GLB renderer checks pass 13 groups: joints, weapon grips/muzzles, all six families across four tiers, every weapon, mixed limbs, Special sidearms, independent dents/scorches, deterministic reset and resource disposal.
- Same-camera front and three-quarter images were compared before admitting the helmet/material change. Actual Tank/Speed preparation, contact and recovery were captured in the game renderer.
- Fresh welcome, returning drafts, failed/empty Community data, practice start and persistent phone/desktop navigation pass. Existing saved choices remain unchanged.

## Still under review

Some ordinary sword contacts are hidden by the near robot's shoulder. Broad flat shell transitions can show faceted shading. These captures do not establish the 60 FPS desktop or 30 FPS physical-phone targets. Final balance, a coherent standalone production rebuild and hosted configuration review remain release requirements.

# S5 mini-game art bible

One page. Every asset that enters a game passes these rules or it does not
enter. Written 2026-08-02 during the "look like real mobile games" upgrade
(plan: `few-things-1-i-warm-reddy`; decisions D20-D28 in S5_DECISION_LOG_AUG2).

## The camera

- **Anything that ROTATES is STRICT TOP-DOWN.** Plan view, no perspective, no
  three-quarter cheat. A tilted sprite tumbles when `sprRot` turns it
  (ADR-0092, learned twice).
- **Anything that NEVER rotates may be TILT-BAKED** (structures: towers,
  buildings). The rig's tilt camera sits at ~55°, orthographic. Visible walls
  and height are what make the board read 3D — use them wherever the law allows.

## Orientation and anchors

- Units are authored/baked **nose pointing +x** (screen right). `sprRot(rot=0)`
  must show the vehicle driving right. Every sim treats heading 0 as +x.
- Tilt-baked structures carry their height ABOVE the anchor; the draw call
  sits the foot of the sprite on the entity's y, not its centre.

## Light

- **One key light, screen top-left**, for every bake and every drawn shadow.
- **No baked ground shadows.** Games draw their own (`longShadow`) so the light
  direction can never disagree between sprite and field.

## Teams

- MINE `#3f8fd0` / THEIRS `#e2574d` (armorclash's constants are the season's).
- Team lives IN the art for units (baked twice) and in **pixel-recoloured
  accents** for structures. Magenta `#ff5cf0` is reserved: hostiles' aim/telegraph
  colour, never a livery.
- Bake-side rule: **replace materials, never negotiate with them.** An authored
  material is a bundle of unknowns (vertex colours, emissive-driven panels,
  broken normals, texture-atlas whites — all found in one evening, D26).
  Painted meshes get fresh Lambert; metal/stone keeps authored materials only
  when it is left completely untouched.

## Files

- Strips: horizontal, square cells, `frames` recorded in the manifest beside
  them (`art-src/baked/strips/manifest.json`). WebP in `public/`, PNG masters
  in `art-src/baked/` (gitignored, never shipped).
- Naming by ROLE, not by source model: `light|medium|heavy|launcher|tower...`
  — the game reads roles; which pack supplied them is the manifest's business.
- Budget: a game's shipped art stays under ~1.5 MB. The baked route makes this
  easy (a full team strip is 8-10 KB); AI-painted plates are what blew it.

## Sources

- CC0 only unless a specific exception is logged: Kenney (kenney.nl) and
  Quaternius (quaternius.com) packs live in `art-src/` with their licenses.
- New models go through `/dev/bake` (dev-only). Its camera enforces this spec
  by construction; a per-model `yawOffset` corrects pack authoring, found by
  eye on the contact sheet once and recorded in the rig's MODELS table.

## The law that overrides everything

**Try-image-else-vector.** Every sprite draw keeps a drawn fallback. A missing,
slow, or deleted asset degrades to the vector game, never to a broken one.

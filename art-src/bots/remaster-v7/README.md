# Three T3 hero remaster pilot

This is an original, locally authored Model Kombat visual review. It is limited to Boiler Knight (teal), Roller Daredevil (coral), and Owl Ranger (indigo). It does not replace the existing catalogue or approve a production art direction.

Source: `scripts/bots-v7-author-heroes.py`. Editable source scenes: the three `*.t3.blend` files. Runtime bytes, texture PNGs and the measured manifest are under `public/bots-art/3d/remaster-v7/`. The review pictures are rendered by importing those exported GLBs again, so they include the exported materials and hierarchy.

## Art specification

- Rounded designer-toy shells, large readable ivory eyes and expressive pupils, restrained brass mechanical joints, convincing forged steel weapons.
- Boiler: broad continuous pressure-vessel torso, service gauge, a helmet framing a visible face, planted boots and heavy hammer.
- Daredevil: narrower racing body, asymmetric brows, independent roller axles, paired sharp steel blades.
- Owl: distinct facial discs and beak, an outside shoulder/backpack cradle with yaw, pitch, deploy and recoil joints, short barrel, and two real holstered sidearms.
- Primary shells are new silhouettes. No previous exported robot was scaled or retargeted to create these assets.
- Initial review target: at most 85,000 triangles and 14 materials per complete hero, 1024-square normal/roughness maps, no remote texture dependencies. This budget is a pilot ceiling, not a demonstrated mobile-performance result.

## Rig contract

Game axes are +Y up and +Z forward. GLB coordinates are metres. Manifest node-local transforms and collision dimensions are millimetres; rotations are xyzw quaternions. The runtime applies full local transforms, not additive offsets.

`root -> pelvis -> chest -> head`; `chest -> shoulderL/R -> elbowL/R -> wristL/R -> handL/R`; `pelvis -> hipL/R -> kneeL/R -> ankleL/R -> wheelL/R`. Daredevil has separate `wheelFrontL/R` and `wheelBackL/R` axle pivots under the wheel suspension node.

Melee `weaponL/R` are children of the corresponding hand; the local origin is the grip. Markers provide each blade heel/tip and hammer striking-face centre, with normal and strike radius. Pupil and lid nodes are `pupilL/R` and `lidL/R`.

Owl hierarchy: `chest -> backpack -> cannonDeploy -> cannonYaw -> cannonPitch -> cannonRecoil -> cannonMuzzle`. The main shoulder cannon contains no hand grip or trigger guard. `backupGun` and `backupGunL` are actual root-local objects; shared pose moves these continuously between their matching holster and hand. `backupHolster`, `backupHolsterL`, `backupGrip`, `backupGripL`, `backupMuzzle`, `backupMuzzleL` supply the frame conventions. Both holstered pistols initially point downward.

Every body collision proxy is measured from the actual meshes in its owning joint's local frame. Head optical nodes are included in head collision. `mk_slot` identifies the six body slots, `mk_surface` distinguishes clay from protected machinery, and `mk_surface_id` is stable per independently deformable surface.

## Materials and provenance

The original analytic clay height field is baked into actual 1024 PNG tangent-normal and roughness pixel maps. These are packed in the source scene and exported inside each GLB. They use low-amplitude mould irregularity and localized concentric fingerprint detail. They are not a promise that an unsupported Blender procedural noise graph will render in Three.js.

All geometry and texture pixels were created locally by the included source. No stock mesh, AI provider, paid generation, externally licensed texture, or copied character artwork was used. Original project assets remain subject to the project's ownership; this document does not grant a third-party distribution license.

## Review gates

Static validity, Blender GLB round-trip images, runtime import, shared-pose contact checks, animation quality, mobile rendering, and human art approval are separate checks. The manifest remains `human-visual-review-pending`. Three heroes only until the human visual review; no catalogue expansion or reinterpretation of prior replay assets.

An accepted shape or mount change will receive a new immutable art/rig/collision manifest before new fights use it. Existing inventory identities and previous combat snapshots remain unchanged.

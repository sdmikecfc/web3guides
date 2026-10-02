# Street Eats preview — original Three.js art specification

This specification applies only to the separate `/chef/diner-preview` renderer. It does not replace or export the existing Domain Kitchen Pixi assets. The preview uses original, code-authored Three.js geometry, not generated pictures on flat cards.

## Authoring and runtime sources

| Source | Responsibility |
| --- | --- |
| `src/app/chef/diner-preview/models.ts` | Shared model factory, food stages, articulated character rig, palette, immutable geometry/material cache, resource disposal |
| `src/app/chef/diner-preview/scene3d.ts` | Truck/cab/ramp and home shells, floor, lighting, camera, interpolation, scene targets and selection states |
| `src/app/chef/diner-preview/DinerScene.tsx` | React lifetime, accessible target selector, camera controls, graphics loading/error/retry |
| `src/app/chef/diner-preview/scene-types.ts` | Simulation-independent render contract |
| `src/app/chef/diner-preview/scene-adapter.ts` | Exact service stations, slots, tables/seats, chef, helpers and customers |
| `src/app/chef/diner-preview/useHomeWorld.ts` | Live home simulation adapter |
| `src/app/chef/diner-preview/ModelIcon.tsx` | Cached catalogue thumbnails made from the same models in one offscreen context |
| `src/lib/chef/diner/content.ts` and `collections.ts` | Recipe, equipment and decoration IDs used by the art check |
| `scripts/dk-diner-art-check.mjs` | Renderer-free geometry and lifetime integrity checks |

`createModel(kind, options)` and `createFoodModel(food)` are the reusable model entry points. `modelKitStats()` exposes retained cache counts for diagnostics. Neither function needs a browser or WebGL to construct geometry. Runtime signs use a small canvas texture in `scene3d.ts`.

## Visual rules

- Rounded, readable toy forms; broad material areas and a few deliberately placed details. Avoid fine texture noise, photographic surfaces, detached parts, or decorative detail that disguises the working surface.
- Shared colours are defined in `models.ts`: warm porcelain, deep teal, mint, coral, walnut and charcoal. The world backdrop is controlled warm peach/cream rather than a heavily lit yellow or gray ground. The compact HUD uses the same family of colours.
- `MeshToonMaterial` uses the shared three-step gradient. Lighting is warm neutral, with one directional shadow source and restrained fill. Catalogue and world models must retain matching materials and geometry.
- Faces have visible eyes, noses, cheeks and a mouth. Chef, waiter and customer roles have distinct outfits; staff uniforms can change without replacing their simulation roles.
- Food uses geometry that explains its identity: layered burgers and toppings, fries carton, separate mozzarella sticks and dip, onion rings, mugs and shakes, waffle grid, pancake stack, lattice pie, brownie, toasted triangles and nachos. Burnt food is charred; dirty plates carry visible food residue.
- Different recipes retain their stable IDs. Raw food and intermediate preparation stages must not silently render as the finished plated dish. Final recipes must not share an identical complete model merely because their prices or names differ.

## Scale, axes and contact

- Units are metres; one navigation tile is one metre. Geometry is Y-up. Simulation `x,y` maps to Three `x,z`.
- The model's working front is **−Z**. The scene converts simulation facing 0 (+grid Y), 1 (−X), 2 (−grid Y), 3 (+X) with `Math.PI - facing * Math.PI / 2`.
- Origins sit on the floor and at the horizontal footprint centre. Footprint anchors from the simulation identify a minimum grid coordinate; the scene offsets multi-cell fixtures to their rotated footprint centre.
- A two-seat table covers 1×2 tiles, or 2×1 after rotation. A four-seat table covers 2×2. Chair centres come from actual seat coordinates, and the chair fronts and seated actors both face the same table centre.
- Chair cushions are around 0.48 m high; tabletops around 0.83 m. Character standing soles meet Y=0. Seated hip registration is checked against the chair seat band. Legs, seat, rear posts and backrest are connected geometry.
- The truck floor is at approximately 0.455 m; pavement is approximately 0.06 m. The ramp physically joins them. The starter truck interior is 4×3, its ramp is at grid (1,3), and pavement is 7×4 beginning at (−1,4). Tier dimensions come from the simulation.
- Stations declare a `surfaceHeight` for held/processing food. Multi-slot food positions fit the actual work surface; the pass uses its wider footprint.

## Camera, input and live state

The orthographic camera is elevated 35°. Truck service starts from −X,+Z so the attached cab does not cover the kitchen. Home starts at a +15° azimuth in portrait and +45° on desktop, showing both interior walls while fitting the room and terrace. Quarter turns take the shortest rotation. Near walls fade. Camera fitting reserves top/bottom UI space and a 12 px left margin. Desktop uses a 68 px right camera-control gutter; portrait uses a 12 px right margin with camera controls moved below the scene. Actual size is observed through `ResizeObserver`. Pan, pinch, wheel and labelled zoom/reset controls are supported.

The simulation updates at 20 Hz; the renderer interpolates those positions during animation frames. It never invents orders, customer routes or payments. Idle, walk, carry, cook, wash, sit and eat poses use the character rig. The food in a hand, on a counter or at a seat comes from that exact simulated object. Ready/burning rings consider every station slot.

Raycasting returns stable station or table IDs and the actual seat ID when selected. An accessible target selector exposes the same targets. The wrapper reports `data-render-status` and `data-selected-target`; the canvas records its last target/seat/tile for diagnostics. Arrange highlights a selected table footprint and shows the working side of a selected appliance.

## Version-two home composition and input

The shared `home-spatial.ts` contract places context objects and regulars on a three-row terrace attached to the restaurant floor. `home-board.ts` constructs the foundation, supported tiles and doorway step; `home-scene.ts` keeps simulation coordinates unchanged. Arched windows, paneled walls, crockery shelving and a taller striped doorway give the starter room a café identity. Scenic details do not become imaginary production equipment.

Home framing uses projected bounds from the actual floor, architecture, furniture and persistent terrace destinations. Actors, spills and changing parcels cannot cause camera jumps. Entering decoration keeps the same scale and exposes a placement grid. Faces have a larger head-to-body ratio, dark oval eyes with highlights, cheek colour, smiles, expressive brows and varied hair/glasses. Regular greetings briefly animate one arm, with rest between waves. Fixed mesh parts are grouped by colour; articulated joints and parcel flaps stay independent. Catalogue lighting retains the world materials.

The cloth follows actual world-space pointer positions. Visible spill size and validated stroke area shrink together. Parcel tape/flaps reflect persisted opening stages. Keyboard users select the same target and use arrow strokes or Enter for successive parcel parts. There is no visible hold-to-clean card. Work stops on release, cancellation, lost capture, a hidden tab or mode change.

The grounding regression checks complete prop/posed-regular bounds and bottom contacts, actual Three.js floor raycasts at all four room sizes, and 1,200 live home states. These establish support and geometry, not aesthetic approval.

## Lifetime and failure handling

The React component creates one scene per mode and keeps callbacks in refs; 20 Hz prop changes do not create new WebGL contexts. Mode change, unmount and retry stop animation, disconnect resize observation, remove listeners, dispose private meshes/materials/textures and the shadow target, then dispose the renderer/context. Initial scene-build failures use the same cleanup. A WebGL context loss surfaces a readable retry screen and calls `onError`; the owning client must pause active service.

Geometry and toon materials in the shared kit intentionally survive temporary icon removal. They are immutable and reused by world and catalogue renderers. Per-instance walls and patience bars clone their mutable materials. Removing/rotating a table or removing a customer disposes their private selection/order resources. Temporary per-frame vectors are not retained; this source audit is not a long-running browser heap or GPU soak measurement.

## Validation and release limits

Run:

```powershell
node scripts/dk-diner-art-check.mjs
```

The check loads the real TypeScript model/content sources, builds their Three.js geometry without a DOM or WebGL, and verifies:

- 22 distinct plated recipe fingerprints, with raw/burnt/dirty states and valid intermediate stages;
- all 19 catalogued equipment types and their tiers, all 14 decoration definitions, plus contextual home objects (deferred equipment remains modelled but is filtered from offers; the pass is truck-only);
- finite vertices, normals and transforms; complete triangles; nonempty dimensions; bounds and per-model triangle budgets;
- dimensions after quarter-turn rotation, standing floor anchors and seated hip registration;
- articulated poses for all three character roles and eight appearance selections;
- private-resource disposal, preservation of shared geometry and stable retained cache counts through ten catalogue rebuilds.

The current gate passes 340 geometry/pose cases. It cannot establish aesthetic quality, touch accuracy, accessibility of the whole UI, or real GPU performance. Root's earlier live in-app-browser review observed a starter home at 60 FPS in a 794×920 viewport; this is not a populated maximum-room or midrange-phone benchmark. Current starter-room framing and cookbook selection were reviewed at 390×844. Every food at playing size, all four live camera views, expanded rooms and long-duration memory behaviour still need recorded visual/device review.

These are editable native Three.js assets. No GLB/FBX export, Blender normalization, canonical asset package, provider generation, rig import or `game-dev` CLI validation is claimed. The installed game-asset-production skill was consulted, but its CLI was unavailable in this environment. A future asset-package/export pass should preserve these axes, pivots, footprints, rig contacts and shared previews, then validate the exported files separately.

## Follow-up acting and input review (20 September 2026)

The neighborhood perimeter is a separate owned environment group with connected pavement, two planted beds and slight foliage motion. It consumes no navigable cells and turns motion off for reduced-motion preferences. Café lamp lenses are modeled surfaces rather than new dynamic lights.

Character elbows and hand-attached tools follow actual pose and work context. Idle motion and blinking vary by appearance and role; a paused scene freezes its accumulated acting time. Kitchen tools never stand in for food and are hidden while carrying or walking. Burgers and fries keep their plate bounds and food-state contract while using stronger edible silhouettes.

Object cues project from world coordinates and never intercept scene input. Direct interactions use the nearest visible physical raycast surface; cutaway walls below 25% opacity pass clicks, while opaque scenery blocks them. Hidden tape and visual-only selection/progress geometry cannot steal clicks. Parcel hinges move during each work stage so the final flap visibly opens before its completed parcel is removed.

Additional checks: `dk-diner-acting-check.mjs` samples 11,520 pose frames and verifies real item ownership, attached props, contacts, blinks, cache stability and plate bounds. `dk-diner-picking-check.mjs` covers eight actual raycast groups, including foreground chair/table/chef occlusion, hidden tape, per-face material visibility and floor instances. Browser review covered the daily parcel across refresh plus phone-size delivery clicks; physical-device performance remains unmeasured.

## Collection surfaces (20 September 2026)

Furniture and food thumbnails share one queued 320px WebGL studio. Their orthographic crop fits all eight projected model-bound corners, preserving tall chair backs and handles. Cache identity includes food stage/temperature and equipment tier/colour. The illustrated pantry uses original 64px SVG ingredient compositions with consistent outlines, warm shadows and distinct silhouettes; these are interface artwork, not replacement world models.

The furnishing catalogue groups buying, storage and room finishes within decoration. The cookbook pairs a plated dish with its real mastery costs and earnings. Phone and short-desktop layouts keep the primary upgrade readable, while truck contents cards remain clear of camera controls. Review at 390×844 and 1280×720 covered both the models and surrounding type; no final aesthetic approval or expanded-room performance result is implied.

Thumbnail initialization failures release the failed studio promise. Context-loss checks prevent blank readbacks from entering the cache; a restored context retries mounted missing previews while preserving good cached images. Large selected dishes receive queue priority, and each completed readback yields a frame so the first finished thumbnail can paint before the whole collection is ready. A mastery change keeps the same dish's earlier plating visible until its new preview is ready; switching recipes never shows the old dish. Transparent fallbacks preserve square framing. `node scripts/dk-diner-model-icon-check.cjs` passes nine mocked lifecycle groups covering initialization recovery, loss before/during/after rendering, unmount, repeated restoration, cache reuse, queue priority and preview identity. These mocks do not replace a real GPU context-loss soak test.

## Character, plating and cooking pass (20 September 2026)

Characters now have fuller faces, oval eyes with glints, curved smiles, animated brows, eating squints and rounded jacket/hand/shoe silhouettes. Café chairs use connected uprights, arched upholstery and cushions; table edges have an enamel pinstripe. Existing hand, foot, seat and food anchors remain authoritative.

Finished dishes receive signature green plating at mastery level three and golden house plating at level ten. The cookbook, held food, worktops and served plates use the same model factory. Raw, intermediate, burnt and dirty food stay faithful to their preparation state. Home art reads the owned recipe level; truck art reads the active service configuration, so equal-loadout events never inherit a player's higher mastery. Thumbnail cache keys use only the three visual mastery bands. The development-only `/chef/diner-preview/art` page compares the real models without touching saves or rewards.

`cooking-effects.ts` owns four bounded instanced-mesh pools per cooking station. Steam follows hot working food; fryer bubbles follow cooking; hand-operated blender bubbles require advancing work; ready dishes glint; burnt food smokes. Empty, cold and dirty items do not pretend to cook. Pause/reduced-motion behavior, input passthrough and private-resource disposal are explicit. Puffs retain depth testing, so equipment, chefs and the truck canopy can occlude them; live truck review prompted stronger contrast without drawing effects through scenery.

Focused gates passed: 80 actual Three.js camera projections plus stable-state checks; six cooking-effect groups; six mastery-art groups spanning 375 cases across all 22 recipes; the existing 340 art cases, 11,520 acting frames, eight picking groups and six home-grounding groups. Scoped diner TypeScript passed. Browser review checked the complete phone room, direct cookbook selection, visible upgrade action and a live burnt-food state. These checks do not certify performance on a physical phone or final player approval of the art.

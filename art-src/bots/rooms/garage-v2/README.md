# Garage review package

Source preview: `/bots/rooms/review`. Toggle the room, phone frame and robot count without changing any player saves.

The exact game robot meshes sit in one Three.js scene. Selectable DOM labels are projected from the same camera as the stand geometry. All instances retain authored unit scale; foot bounds establish contact only.

The user said "keep going please" on 2026-09-10 after the concrete room previews. The layout and Form visual direction is accepted; Blender, final export and runtime audits remain open. This package is **not a final asset export**. The original visual reference is `../../concept/1-garage.png`. Scene implementation: `src/app/bots/_view/living-room.ts`.

Open `contact-sheet.html` for the original reference and source layout diagrams. `plans/desktop-layout.svg`, `plans/mobile-layout.svg` and `plans/front-elevation.svg` are reproducible with `python art-src/bots/rooms/generate_review_plans.py`. They are source-coordinate drawings, not a substitute for the final multi-angle Blender mesh audit.

Production fallback is the unchanged HEAD garage in `LegacyGarageRoom.tsx` and its separate CSS. The new room is enabled only by the literal `NEXT_PUBLIC_BOTS_ROOM_PREVIEW=1`; the isolated review route always shows the new form.

Runtime uses one canvas, real authored-unit robot parts, a common floor and shadow map, per-material static batches, a desktop DPR cap of 1.5 and phone cap of 1.35. Hidden scenes and reduced-motion poses pause; shadows update with the deliberately stepped 12 Hz poses. No dent geometry or additional physics engine is allocated in room scenes.

The rejected procedural wall and furniture have been replaced with the existing `workshop-interior.png` projected separately onto a back wall and floor. This preserves the warm original art and correct ground horizon for both desktop and phone cameras. Trolleys, caster wheels, handles, number plates, corkboard and robot shadows are real 3D. This is a fixed-camera display set; arbitrary camera movement behind the backdrop is not supported.

`renders/garage-desktop-form.png` and `renders/garage-mobile-form.png` are the root agent's actual game screenshots submitted for Form review. The user then said "keep going please"; see visual-direction-approval.json for the accepted scope and remaining technical gates.

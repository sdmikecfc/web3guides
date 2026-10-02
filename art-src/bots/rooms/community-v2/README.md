# Community review package

Open `contact-sheet.html` for the original concept, current game screenshots and source-coordinate desktop/phone diagrams. The exact saved/practice robot actors are rendered in the shared scene; the Community UI owns labels, replay actions, scoreboard data and recent-fight tickets.

The original `street-elevation.webp` is projected onto two workshop facades and a physical foreground floor. The facades leave a central opening, with real portal posts, trim, bulbs and an exact-text ARENA sign. `arena-evening.png` sits four units behind the frontage to make the arena a clear destination. This is a fixed-camera display set, not a complete navigable street mesh.

`renders/community-desktop-form.png` and `renders/community-mobile-form.png` are actual game captures submitted for Form review. The user accepted the visual direction on 10 September 2026. Technical audit gates remain open. No paid generation or final Blender export has occurred.

Source preview: `/bots/rooms/review`. Toggle the room, phone frame and robot count without changing any player saves.

The exact game robot meshes sit in one Three.js scene. Selectable DOM labels are projected from the same camera as the stand geometry. All instances retain authored unit scale; foot bounds establish contact only.

The user said "keep going please" on 2026-09-10 after the concrete room previews. The layout and Form visual direction is accepted; Blender, final export and runtime audits remain open. This package is **not a final asset export**. The original visual reference is `../../concept/5-street.png`. Scene implementation: `src/app/bots/_view/living-room.ts`.

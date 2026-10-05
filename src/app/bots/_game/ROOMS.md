# Model Kombat concept-art rooms

Updated 8 September 2026. The existing main game shell owns room selection, saved builds, purchases and embedded fights. Combat Lab remains a separate v4 practice experience.

## Presentation

- **Garage:** the workshop plate fills the room behind the actual selected toy and timber stand. A clipped-paper card holds its real build/fight/name actions. Five compact bay portraits sit along a wooden collection shelf; selecting a bay changes the stand, not the saved equipment.
- **Parts:** the original warm timber cabinet artwork forms real display rows, with transparent photographs of the available parts and paper price tags. A counter shows the selected object, its stats and the existing purchase/eligibility action. Filtering, stock and prices are unchanged. Phones use the same inspection sheet; the weekly delivery board and extra item explanations expand on demand.
- **Build and first setup:** the workshop surrounds the actual robot, overall stats and tool-board controls. Part previews use the same wooden display artwork. Desktop stats remain on the left and part comparison on the right. On phones, bounded stacked panels keep the robot and controls in the app window while the parts list scrolls.
- **Fight:** the contender stands against the original lit arena plate. Starting a fight opens the existing embedded viewer and retains its current engine and replay results.
- **Community, Help and supporting panels:** Sprocket Row uses the street plate, prizes use the arena, the tool board uses the timber cabinet, and Help/name/earning panels use the workshop. Close and Escape return to the previous room without losing choices.

Runtime art is reused from `public/bots-art/plates/` and `public/bots-art/shop/cabinet-bay.png`. The illustrative robots in `art-src/bots/concept/` remain references, not substitutes for players' real builds.

## Rendering and layout

`ToyDisplay` adds `cutout` and `workbench` variants. Cutouts render transparent backgrounds with a contact shadow; workbench also includes the timber stand. Existing cream, dark and workshop variants remain available. Static inventory photographs still share one offscreen WebGL renderer and are cached by build, look, variant and size. Pending pictures hide their old canvas so a newly chosen part is not temporarily labelled with the previous part's image. Empty builds use a finite ground fallback.

The app header and six room controls stay within one fixed shell. Main desktop rooms fit the viewport. Inventory shelves scroll internally; narrow garage bays swipe horizontally. Very short landscape screens scroll the room content inside the fixed navigation. Supporting panels retain modal focus and Escape behavior, including native disclosure controls.

## Verification

- TypeScript passes.
- Existing workshop/stock identity and five-bay save/restore checks pass.
- Existing game-state/onboarding and every-starter-offer preview/isolation checks pass.
- Browser checked desktop, 390×844, 320×568 and 844×390 layouts. Corrected intrinsic-width overflow in Garage and clipped Parts shelves before delivery.
- Checked shop Head + purple filtering, selected object/stats, mobile inspection and its transition to the earning panel, room navigation, Help and Community artwork, and preserved existing Rusty Pickle build.
- Full production build passes with all three existing workshop/onboarding flags enabled. Build log: `C:\Users\Mike\Documents\Codex\2026-09-07\i-b\model-kombat-rooms-build.log`. Existing optional wallet-package and Browserslist warnings remain.
- Compiled browser on isolated port 4137 completed all seven first purchases: Head 2, Body 3, different Arm 4/6, different Leg 5/6 and Weapon 8. The final weapon preserved the earlier body choices. A 35-second first fight completed, replay reset to 0:00, and returning opened the saved Garage. An empty third bay's Fight view showed the finish-build action without rendering errors.
- Compiled browser error logs were empty. Five HTTP checks returned 200 for the ModelKombat home, Doma Parts route, separate Lab and both workshop/cabinet artwork assets.
- At 320×568 the compact part list requires internal scrolling; at 844×390 Garage/Parts can scroll vertically inside the fixed shell. No claim is made that all inventory items fit simultaneously on small screens. Native reduced-motion runtime and physical phone performance were not newly measured.

No production deployment is performed by this change. The previous competition-service and wallet-verification launch gaps are independent of room presentation. No physical mobile-device FPS claim is made. The room scenes use static concept-art plates; they are not freely navigable 3D environments.

## Preview and deployment

Run the development server with the existing workshop features enabled:

```powershell
cd C:\Users\Mike\Desktop\web3guides
$env:BOTS_ONBOARDING_V1 = '1'
$env:NEXT_PUBLIC_BOTS_WORKSHOP_V1 = '1'
$env:NEXT_PUBLIC_BOTS_TOY_PILOT = '1'
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/bots`. Sample collection is `http://127.0.0.1:3000/bots?tour=1` and never grants or spends the player's coins.

Vercel already has the main workshop feature variables. Deploying publishes the complete project, including any other uncommitted project edits:

```powershell
cd C:\Users\Mike\Desktop\web3guides
vercel --prod --yes --env BOTS_COMBAT_LAB=1
```

This also explicitly includes the separate Combat Lab at `https://modelkombat.xyz/lab`. The main game remains at `https://modelkombat.xyz/`.

## Discord changelog

The workshop has its rooms back. Your garage now displays your robot on the stand, the Parts shop has wooden shelves and a proper inspection counter, and the build bay and arena have their own settings. Sprocket Row and Help belong to the same little world. Your saved robots, parts and fight rules stay the same. Phone layouts have also been tightened up.

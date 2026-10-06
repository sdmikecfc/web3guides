# Downtown scenery and fries supply review — 24 September 2026

The previous street used repeated facades with fixed vertical centres, horizontal bicycle wheels and an additional generic road drawn by the truck scene. This revision replaces the Downtown block with four distinct shopfronts, correctly grounded doorways, glazing, awnings, roof details, sidewalks, a crossing, planted seating areas and continuous ground. The generic crossing road is removed. The bicycle has an upright frame and wheels, a seated forward-facing rider, moving cranks/legs and wheel rotation. Foreground architecture fades completely when viewing through the block; streetside plants and seating remain visible.

Cooking potatoes were already free pantry supplies for menus containing fries. Market and packing copy now explains the explicit menu selection and source. Pantry feedback lists its actual contents. A fries menu shows potatoes in the world crate alongside buns when both are needed. Buying a recipe still does not silently add it to the menu or consume saved mastery ingredients.

## Verification

- Seven market checks, including fryer + recipe purchase, automatic box ownership, explicit burger/fries selection, reload and physical potato pickup with no mastery-inventory consumption.
- Eight existing physical cooking/conservation groups, including preparing and serving fries.
- Sixty route/truck-size/quality builds, four camera directions, animation pause/reduced motion, bounded events and disposal.
- Bicycle wheel orientation, road contact and direction regression checks.
- Scenery maxima: low 17 draws / 30,540 triangles; medium 17 / 47,516; high 18 / 47,516. These are additional scenery costs, not whole-frame totals.
- TypeScript no-emit check passes. Local preview renders; browser pantry selection shows Bun and Potato, and choosing Potato yields “Picked up potato.”
- Desktop and 390px low-quality visual review. Browser emulation is not a physical-device performance result.
- Source dependencies preserved. All generated preview output/captures stay on D:. No production deployment performed.

## Beta-count investigation

Read-only Vercel Analytics query on 24 September: the shared web3guides production project records 153 homepage visitors and 235 homepage pageviews over the preceding seven days. Its query API cannot filter these totals by hostname. This is therefore NOT a Domain Kitchen player count. Historical explicit game paths (/chef, /diner-preview, /chef/diner-preview) report 5 visitors / 13 pageviews across the full retained period, excluding root visits, and likewise must not be presented as total beta players.

The released beta entry uses browser-local wallet-scoped saves and does not create a server-backed player record or emit a Play beta analytics event. Confirmed beta players and X-to-play conversion cannot be reconstructed from the available totals. No analytics settings, tracking events or paid service changes were made during this investigation.

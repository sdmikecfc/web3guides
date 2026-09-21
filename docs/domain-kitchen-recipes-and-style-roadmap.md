# Domain Kitchen: food and furniture worth collecting

This is a source audit and proposed content roadmap for the September 21, 2026 restaurant revision. The food audit inspected the implementation following `63b4a5f1`; the current-pass section below records the accompanying room and catalogue additions. The recipe progression, pasta/ramen implementation and larger collection targets remain proposals, not shipped features.

## What the game actually has

There are **22 recipes**, not only burgers and fries. Their station chains run through the deterministic cooking engine and have distinct food-model branches. The content is further along than the way the game introduces it.

| Discovery group | Current recipes | Main equipment reused |
|---|---|---|
| Starter | Classic burger, fries | Grill, prep counter; fryer after discovery |
| Downtown | Cheeseburger, hot dog, side salad, lemonade, coffee | Grill and prep; drinks station or coffee machine |
| Boardwalk | Onion rings, mozzarella sticks, grilled cheese, fried chicken sandwich, vanilla shake, ice-cream sundae, pancakes | Grill, prep, fryer; blender for shakes |
| Night Market | Bacon deluxe burger, strawberry shake, apple pie, strawberry waffle, brownie, loaded nachos | Grill, prep, blender; oven and waffle iron |
| Secret | Chili cheese fries, avocado burger | Existing fryer, grill and prep |

The relevant sources are `src/lib/chef/diner/content.ts`, `service.ts`, `batch.ts`, `progression.ts`, `authority.ts`, and `src/app/chef/diner-preview/models.ts`.

### Working today

- A new save owns only classic burger. The first trip initially selects that one dish.
- Learning a recipe does not add it to the truck's menu. `buyTruckRecipe` changes ownership; `setTruckMenu` is the separate, explicit choice that changes orders.
- A truck menu contains one to four owned recipes. It can change during equipment setup or between stops, and is frozen once food preparation/service has started. Opening validates the required installed stations and supplies.
- The parked-truck **Choose menu** control shows selected dishes. **Equipment** shows owned pieces not currently installed. Removing a machine from the layout retains ownership in the trailer; it does not sell or destroy it.
- Pantry/fridge choices reflect the selected menu. Clicking a supply with multiple options starts walking before the player chooses an ingredient.
- Clean plates and cups have finite, separate pools. Washing returns the actual vessel. The basic sink holds two dishes. Fries use disposable boxes.
- Fries have a genuine three-portion batch: cut, fry, explicitly raise the basket, then portion into boxes. An unraised basket can burn; raising it prevents that burn timer from continuing.
- Untimed preparation can create real food before opening. Existing portions, machine jobs and carried items remain when service begins.
- Recipe mastery spends permanent pantry ingredients and increases serving value. The physical ingredients taken during a shift do not consume that progression inventory.
- Recipe purchase, menu changes and layout changes use commands replayed by the authority layer; callers do not submit their own price or reward total.

### Important limitations

| Area | Current limitation | Consequence |
|---|---|---|
| Physical cooking detail | Supplies expose a recipe's first ingredient and explicit assembly ingredients. Only bun is currently an explicit added component. | A cheeseburger really fetches beef and bun, but cheese is folded into its prep step. Listing several ingredients in the cookbook does not mean each one is physically handled. |
| Pasta and ramen | Neither recipes, their ingredients nor a boiler exist. | These need a small complete cooking feature, not renamed burger data. |
| Serving vessels | Bowl and pizza-dish IDs are reserved but unavailable, with no supply station. | A noodle recipe cannot honestly ship until its vessel, washing, stock and presentation work. |
| Batches | Only plain fries use the portioned-batch state machine. | Onion rings and mozzarella are individual portions today. Other batch foods need explicit work and validation. |
| Growth | `routeTier` requires a route win **and every recipe from that route** before increasing truck size. | A player who prefers burgers is still forced to collect coffee and other unrelated dishes to grow. This conflicts with specialization. |
| Road shop discovery | Equipment offers are sampled from all available unowned equipment; recipes are sampled separately from the route. | An attractive recipe and the machine needed to cook it can appear separately, without a clear next step. |
| Home connection | The tutorial fryer grants one home copy; ordinary roadside equipment purchases currently grant truck ownership only. Home copies then cost coins. | The earlier promise that every first machine discovery includes one home copy is not generally implemented. |
| Home orders | `homeMenu` filters an explicitly selected home menu by installed machines. The cookbook still has Add/Remove home menu buttons. | Placing a new machine does not universally enable its dishes by itself. |
| Recipe evidence | Tests execute all 22 station chains in the legacy abstract-ingredient mode. Physical-service tests cover the core burger, fries, preparation and vessel flows. | This is not proof that every later recipe has been played end-to-end with the current physical supplies and tutorial UI. |
| Decoration breadth | The current revision has 27 purchasable decor designs and eight earned keepsakes, plus equipment and finishes. | The two new families establish a direction; the larger coherent catalogue described below still needs content production. |
| Style discovery | The current revision adds collection browsing using existing `setId` data and sensible equipment groupings. | Players can now find small-town and art-deco pieces without scrolling through every appliance. More sophisticated search is unnecessary at this size. |

### Implemented in the accompanying room/catalogue revision

- **13 new decoration designs:** six small-town diner props and seven art-deco restaurant props. There are now 35 decor designs in total: 27 purchasable objects and eight earned keepsakes. This count does not include equipment, stools or finish recolors.
- **Eight collection filters:** Everything, Kitchen, Seating, Burger shop, Small-town diner, Art deco, Garden and Keepsakes. They live in one compact selector inside the existing Furnish/Storage/Style interface, and collections can be mixed.
- **Four diner gifts:** wall clock, carved bear, woodland trophy and pie display. The full restaurant includes four different gifts: chandelier, wine cabinet, sunburst mirror and brass palm planter. Grant receipts prevent repeated claims; existing rooms receive gifts in storage rather than a forced rearrangement.
- **Stage finishes:** worn wood and timber panelling for the diner; terrazzo and art-deco walls for the full restaurant. These are permanent cosmetic finish grants, with dining-area flooring distinct from working kitchen/bathroom surfaces. Explicit renovation advances untouched defaults while retaining individually purchased choices. Existing rooms are not silently recolored on load.
- **Seat continuity:** the diner has six available bar positions, but normally starts with the three classic stools brought from the burger shop. Extra owned stools carry forward too. No free six-stool upholstered upgrade is applied. Stool construction and appearance stay classic until the player replaces them, and chosen upholstery colors remain independent.
- **Stool management:** buy and install classic or upholstered stools, replace individual classic stools while retaining their old copy, store an installed stool, and place an owned spare for free. Counts distinguish owned, installed and stored; stored seats are discoverable under Storage.
- **Honest object presentation:** the chandelier is a ceiling item; keepsakes explain friendship acquisition; pie displays, wine cabinets and jukeboxes are identified as decorative rather than advertised as unimplemented gameplay systems. New finishes have readable names and material swatches in the visible-room preview.

These additions implement the first collection layer. They do not change recipe acquisition, unlock pasta/ramen, replace the current cuisine progression or resolve the home-menu gaps listed above.

## The progression to build

**Broaden the player's choices before lengthening their recipes.** A new dish should mostly reuse a workflow they know, with one understandable twist. More menu variety is an optional challenge, not a mandatory consequence of gaining a reward.

Use three to five understandable cooking beats for a dish. That counts meaningful preparation stages, not every walk, pickup and plate-return click. Show the real sequence in a pictorial recipe card so the UI does not understate the work.

| Chapter | Core choices | New skill | New equipment burden |
|---|---|---|---|
| First lunch | Classic burger only | Cold ingredient, grill, bun assembly, plate, serve and wash | Existing starter kit |
| Make it yours | Cheeseburger **or** hot dog; optional fries | Familiar grill work, or preparing a three-portion side in advance | At most one fryer |
| Small-town favourites | Grilled cheese, pancakes, salad; optional coffee or shake | A second timing pattern, a cold-prep alternative, or a separate cup cycle | Choose one drink machine; no need to install both |
| Pasta stop | Tomato pasta, then a pesto/cream variation | Boiler basket, draining and sauce assembly | One shared boiler; existing prep counter; bowl storage |
| Noodle nights | Simple vegetable ramen, then grilled-chicken ramen | Coordinate noodles and a warm broth portion; optional grilled topping | Reuse boiler, prep and grill; no ramen-only appliance |
| House specials | One baked speciality or deluxe variation | A carefully chosen extra station or component | Oven only if the player chooses baking |

Do not withhold the pasta/ramen path until every burger, shake and dessert is collected. Offer a visible branch after the player proves the first workflow. A pasta truck should be a viable identity, not an obligation to run a burger truck with pasta bolted onto it.

### Example cooking cards

- **Classic burger:** take cold patty → grill → combine with pantry bun at prep → plate → serve.
- **Fries:** take potato → cut → fry and raise basket → portion into a box → serve. The raised basket provides three orders; the player can prepare it before customers arrive.
- **Tomato pasta:** take dry pasta → boil and lift basket → combine with tomato sauce at prep → bowl → serve. Sauce is an explicit component, not a hidden ingredient deducted from the mastery pantry.
- **Pesto pasta:** use the same noodle workflow with a different sauce. Its distinct plating and price can make it desirable without another machine.
- **Vegetable ramen:** boil noodles → warm a broth portion on the existing hot surface → combine noodles, broth and prepared garnish in a bowl → serve. These are two parallel jobs; introduce this after a one-job pasta lesson.
- **Chicken ramen:** the same base, with a grilled topping the player can prepare in advance. Keep it an optional advanced recipe; do not silently substitute it for simple ramen.

The boiler should use reusable basket/portion rules, not a separate custom engine per noodle. Model sauce, broth and optional toppings as typed components. A physical component should belong to a compatible food family until final assembly, rather than needing a different identical raw patty for each burger variant. This avoids a supply menu full of visually identical ingredients and lets advance preparation remain useful when orders vary.

Soup/noodle bowls need their own finite washable stock. A rack can hold a chosen vessel set during preparation, or a compact separate bowl rack can provide an optional space trade-off. Neither should appear only after a customer has ordered an impossible-to-serve dish.

### Choosing the day's work

Keep it in the parked truck, without another major navigation destination:

1. Show **Today's menu** with one to four dish cards and an honest workload hint.
2. Selecting a dish highlights required equipment, supplies and vessel stock. A missing piece offers **Place from trailer** or points to its discovery source.
3. Deselecting a dish immediately removes future orders for it before opening. Offer **Store unused equipment**, with a preview and undo; do not silently rearrange the player's kitchen.
4. **Practise this menu** begins with no progression risk and the same physical equipment layout.
5. **Open for lunch** summarizes the actual menu, number of seats and difficulty. Buying or receiving a recipe never changes that summary automatically.

Later, save two or three named menu/layout presets such as Burger lunch and Noodle night. Validate ownership, footprint, reachability and vessels when restoring a preset. Do not reset machine condition by storing it.

Truck size should depend on verified successful cooking accomplishments and a deliberate purchase, with the exact thresholds calibrated separately. Recipe collection remains rewarding, but collecting every side dish must not gate a different cuisine.

### Connect every discovery to home

The clearest rule remains: a first production-machine discovery unlocks truck installation and grants one restaurant copy once. Utilities such as plate racks and bins can stay truck-only, with that distinction on their card. Preserve old owners with explicit migration receipts instead of repeatedly gifting a copy on load.

At home, installed, working, reachable equipment should determine the candidate menu from learned recipes. Any optional house-special preference should refine that menu rather than require activation before the machine does anything. Recipe mastery belongs to the dish across both kitchens. Actual production must still use the compatible machine.

## A catalogue that supports restaurant identities

Keep **style collections inside Decorate**, using the compact selector now implemented. A second filter for Seats, Counters, Lighting, Wall pieces and Small things is a later option only if the growing catalogue needs it. Keep one coherent storefront, not a tree of new menus. Search and an Owned filter become useful once content expands.

Three primary style families match the renovations. They are recommendations, not rules forbidding mixed rooms. A player should be able to keep a burger mascot in an elegant restaurant, or build a modern café inside the diner shell.

| Collection | Shape and material language | Useful purchases | Character pieces |
|---|---|---|---|
| Burger shop | Cream laminate, cherry vinyl, restrained chrome, welcoming graphics | Connected counter extensions/corners, three-stool consoles, additional stool options, condiment rails, practical lights | Burger mascot, paper menu board, milkshake print, tabletop radio, entrance mat, larger planters |
| Small-town diner | Scuffed wood floor, warm timber, inherited red stools, upholstered wall booths | Booths in two widths, matching bar returns, later upgraded stools, pendants, pie display | Oversized clock, carved bear, playful deer trophy, local postcards, pennants, old road signs, souvenir shelf |
| Art-deco restaurant | Quiet terrazzo/stone, rich wall panels, brass lines, linen, upholstered seats | Dressed tables, dining chairs, standalone bar, wall sconces, chandelier, wine storage, screening planters | Framed geometric artwork, tasteful vases, table candles, host stand, decorative mirror, wine display |

The four-item renovation packs now establish character immediately. Further purchases let the owner change that character. Starter stool ownership and appearance carry forward unless the player buys a replacement; expansion does not silently turn three stools into six premium ones.

Aim first for **roughly 12–16 distinct purchasable designs per family**, plus practical shared equipment. This is a proposed production target, not a count of current assets. Recolors are useful customization options but must not be counted as dozens of genuinely new designs. Review each collection mixed with the other two at phone size before expanding it further.

Each sellable item needs:

- A readable, fully framed preview and a name describing the object.
- A style tag, placement type, dimensions, rotation support and actual seat/counter compatibility.
- A clear effect label: production, comfort or decoration. Decoration should not imply unimplemented gameplay advantages.
- Price, placed/stored count, and a placement preview before confirmation.
- Appropriate placement: wall trophy on a wall; counter ornament on a surface; chandelier overhead; floor bear on the floor. An overhead light must not invisibly block walking tiles.
- Consistent ownership, storage, sale and migration behavior. One-time free packs must not become repeatable coin sources.

The accompanying revision makes the new flooring zone-aware: diners get wood in the guest area while the working kitchen and bathroom keep practical surfaces; full restaurants get restrained stone in dining areas. Preview changes in the visible room, then buy. Counter fronts, worktops, upholstery and the sign remain separate finish choices. Independently selectable wall trim or interchangeable architectural panel styles beyond these finishes remain future customization work.

## Delivery slices and proof

1. **Room revision:** the accompanying change supplies the revised layouts, four gifts per upgraded stage and stage-appropriate finishes. Complete its visual/service review separately; preserve old furniture, especially stools, and keep optional cosmetics optional.
2. **Catalogue expansion:** build on the implemented collection selector, mount/size metadata and first small-town/art-deco sets. Expand useful objects before adding many recolors.
3. **Make current food discoverable:** show the 22 existing recipes and exact acquisition requirements; fix recipe-completion growth gates and misleading equipment discovery cards. Play every existing recipe with physical ingredients and the current UI.
4. **One noodle-family proof:** boiler, tomato pasta, real sauce component, washable bowls, equipment storage and menu switching. Verify full truck-to-home behavior before adding variants.
5. **Ramen and collections:** one broth workflow, then optional topping variants; expand art and style families only after the reused workflow feels good.

Required recipe checks include a selected pasta-only menu after burgers/fryer are stored; no burger orders; usable pantry/fridge choices; exact vessel conservation; prepared components surviving pause/reload; rejected duplicate rewards; and no free equipment copies from repeated discoveries. Browser checks must cover choosing a recipe, placing its supplies, preparing it, serving it and returning to a restaurant that can actually sell it.

### Audit validation

Run locally on September 21, 2026, without database writes:

- `scripts/dk-diner-recipe-policy-check.mts`: **7 groups passed** (ownership, opt-in menus, authoritative purchase rejection, migration and first discovery).
- `scripts/dk-diner-service-check.mts`: **19 groups passed** (including all 22 ordered station chains in legacy ingredient mode).
- `scripts/dk-diner-service-flow-check.mts`: **12 groups passed** (physical preparation, patience, dirty dishes, sink capacity, fries batches and vessel pools).
- The accompanying catalogue passed the focused presentation TypeScript check. A separate read-only source audit verified 35 decor definitions, 27 purchasable designs, eight keepsakes, 13 new descriptions, eight filters, two four-item stage packs, four new finish previews and the four stool command bindings. This was a source audit, not a browser or art review.

These results validate the existing mechanics within those scenarios. They do not claim that pasta, ramen, all physical recipe combinations or the proposed style catalogue are implemented, visually approved or playtested.

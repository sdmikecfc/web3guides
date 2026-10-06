# Fries purchase-to-cooking repair

## Behavior

- Roadside markets allow explicit truck-menu selection. Buying a recipe or machine still does not change the menu automatically.
- After buying both Fries and its equipment, the purchased recipe card offers **Add Fries to truck menu**. The market also explains placement and free cooking potatoes.
- The cookbook uses the same menu-edit policy as the simulation, allowing changes during truck setup and market stops. Preparation, open services and fixed rally menus remain protected.
- Truck setup shows a phone-visible **Add Fries** action or the next missing placement (**Place fryer**, then boxes). Once packed, it points to the wooden pantry for potatoes.
- Existing purchases need no reset or repurchase. Select Fries before preparing the next service, place the equipment, then take potatoes from the pantry, cut on prep, fry, raise the basket and box the portions.

## Verification

- `dk-fries-purchase-check.mts`: recipe-first and fryer-first purchases, deliberate menu selection at the first market, reload, equipment placement, setup menu edits, free potatoes, a three-portion basket and delivery to an actual fries customer. Home menu and carried money remain correct; opened-service menu edits reject.
- `dk-diner-recipe-policy-check.mts`: all seven ownership, selection and compatibility groups pass.
- `dk-diner-batch-check.mts`: all eight finite-batch, vessel and preparation groups pass.
- Real browser controls exercised in the disposable first-market fixture: buy, add Fries, continue to the next service, remove/re-add during setup, and add through the cookbook. Reviewed at 390px and 360px; physical-device testing is separate.
- Isolated production build passed (exit 0), including type checks and all 266 generated pages, in `D:\Temp\domain-kitchen-routes-build-20260923`; log: `D:\Temp\domain-kitchen-fries-build.log`. Existing optional WalletConnect logger and unrelated season-data warnings remain. Source dependencies are intact.

No database migration is required. Production release remains the user's own `vercel --prod`.

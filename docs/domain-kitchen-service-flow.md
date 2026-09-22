# Truck service flow

New ordinary trips use map version 4: eight cooking days, equipment/ingredient
markets immediately after days three and six, and two branching event stops.
Older saved trips keep their exact routes. Head-start trips retain the remaining
market's recipe selection without earning rewards for skipped stops.

Arrange only places owned equipment and chooses the menu. Markets offer new
machines, upgrades, seating, needed serving supplies, and named ingredient packs.
Each 70-coin pack contains one of every ingredient needed for its owned recipe's
next permanent upgrade. Paid packs do not consume the free daily ingredient cap.

Cook → Upgrade dishes opens the cookbook. Recipe help also offers upgrades below
the cooking instructions, showing required ingredients and the change in base
sale value. A service keeps its starting recipe levels; upgrades apply at home
and to subsequent services. Rally recipes keep their equal-equipment levels.

Five verified ordinary service completions unlock service level 2 and the first
helper seat in the starter truck. Existing crew can be assigned free; hiring an
additional worker costs 500 coins. Assignment is available between days or during
untimed setup. Practice, rally attempts, and duplicate receipts do not advance
this milestone. Existing larger trucks keep their helper capacities.

Downtown builds pressure gradually. The third opening-trip service has eight
guests, a 32-second base arrival gap, and one waiting place. Later days increase
throughput. Full queues delay admission rather than stacking guests or dropping
them from the day's total. Events modify this baseline rather than replacing it.

Recipe buttons explain the selected rally dish. Back home ends an unfinished
rally attempt while retaining its earlier best score; completed results are saved
before leaving.

## Verification

Run checks with the repository's in-memory TypeScript runner:

`node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/<check>.mts`

Relevant checks: `dk-diner-pacing-check`, `dk-diner-queue-check`,
`dk-diner-service-level-check`, `dk-diner-scheduled-market-check`,
`dk-diner-rally-ui-check`, plus existing service, progression, route, event,
recipe-discovery and truck-capacity checks. Pacing checks use actual movement,
cooking and washing actions, including a one-second decision delay.

Git pushes do not publish production. The owner releases with `vercel --prod`.

# Live newcomer walkthrough — 26 September 2026

Perspective: impatient crypto user attracted by the advertised $2,000 prize pool. This is an agent walkthrough, not evidence from recruited human testers. Reviewed the deployed website, not the newer local journey preview.

## Actual path

Opened https://www.modelkombat.xyz, which led to /bots/workshop. This browser already held a two-part draft and an older classic garage. Reopened the welcome through Help → Show me around; did not clear existing storage. Continued the draft, finished a T1 Ranged robot named Prize Hunter, won a 29-second house fight, received 75 game coins and spent them on a T2 Ranger Tracker right arm. Checked Progress, its wallet/trading link, competition rules, Prizes, and Community. No wallet connection, real-money trade, cash competition enrollment or production deployment was performed.

## What worked

- The robot renders, three style names and persistent room navigation communicate the basic game.
- Build review explains permanent equipment. Exact finished robot appeared in the garage.
- The first fight produced a visible win, recorded history and spendable game coins. The purchased item appeared as an owned spare.
- Clear statements distinguish game coins from withdrawable money.
- The failed Community feed retained practice robots and an action instead of a completely blank room.

## Findings in priority order

1. **Cash-prize path is absent from the main journey.** Welcome, builder, first result and Progress did not show entry status, qualifying days, cash rank or a next qualification action. A user following the obvious buttons could finish a session without learning how to qualify.
2. **The trading dashboard leaves the current game.** Progress links to `/bots?collection=classic&panel=earn`. The new teal workshop and Prize Hunter become the old brown interface and this browser's Rusty Pickle. This was a switch of interfaces/saves, not proof that the new save was erased. The user is given little reason to know that distinction.
3. **Published rules conflict with the play loop.** The new workshop promises 75 coins per completed fight and 12 daily rewarded fights. Classic Feed your robot lists 10/20/40 for wins, 3/5/8 for losses, and no practice rewards. Rules describe two attacks per robot. These may belong to different modes, but the journey does not explain which mode advances the giveaway.
4. **First-win reward is contradictory.** Header changed from 0 to 75 and Progress records +75, while the immediate result panel said “Fight finished — 0 game coins.” This damages trust at the first reward.
5. **Competition is not configured as imminent.** Prizes says “Launch date has not been set. The competition has not started.” The live rules require a verified Doma Strategy trade on three different days per week, and both weeks for the final; this is buried far from the entry screen. Current split shown: $800 ROI, $800 realized profit, $400 battle points. Confirm intended launch rules before changing copy or configuration.
6. **Starting a fight requires two starts with different names.** “Start a house fight” opens an idle arena with “Start practice.” The visitor cannot easily tell whether this counts.
7. **Parts impose work before explaining value.** Repeated left/right selection and optional stats encourage choosing the first matching item. Three Ranged limb variants show identical headline numbers. Weapon tiles show “0 health,” which is unhelpful. A suggested complete build and plain benefit/cost would support skimming.
8. **Early purchase has little immediate payoff.** Spending all 75 earned coins buys a spare that cannot improve the finished robot. The rule is stated, but there is no visible target showing how this purchase advances the next complete fighter.
9. **Polish defects weaken credibility.** Welcome visibly prints a literal `{journeyPreview?...}` expression and its title was clipped in the tested desktop viewport. Finish required a second click after entering the name. Community's recent-fight feed failed, including after retry.
10. **Spectator emphasis is weak.** In the tested 1280×720 fight, the elaborate arena occupies most of the frame and fighters are relatively small. Special became available late in the short fight; the attempt to activate it was overtaken by the finish. This is one match, not a universal claim about Special timing or combat balance.

## Forty-eight-hour priority

Do not expand the catalogue or redesign combat for this audit. First establish one authoritative launch ruleset and date, then surface the giveaway in the current shell with entry status, qualifying days, rank and next action. Keep cash-prize progress distinct from game coins. Remove the unexplained classic detour, make result rewards accurate, unify fight labels, and fix visible launch-polish failures. Test the entire path with a real newcomer and a real wallet owner before enabling the competition.

Suggested short landing copy, conditional on the published rules being confirmed: “Build a robot. Battle for a share of $2,000. Free to try. Cash prizes require verified Doma Strategy activity on three different days each week.” Pair this with exact competition dates, a concise qualification explanation and a clear statement that trading uses real funds and can lose money. Do not imply everyone receives $2,000 or that ordinary game coins are cash.

## Evidence and limits

- `D:/Temp/modelkombat-live-first-win-2026-09-26.png`: 75 in header, 0 in result.
- `D:/Temp/modelkombat-live-trading-detour-2026-09-26.png`: classic interface and different robot after Progress link.
- `D:/Temp/modelkombat-live-prizes-2026-09-26.png`: unset launch date and prize explanation.
- Live sources: https://www.modelkombat.xyz/bots/workshop and https://www.modelkombat.xyz/bots/rules.
- Existing browser saves prevent calling this a clean enrollment test. No physical phone, real wallet signing, prize settlement or trading verification was tested in this walkthrough. Local changes not deployed cannot be counted as live fixes.

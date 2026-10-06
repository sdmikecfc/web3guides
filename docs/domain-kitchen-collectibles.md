# The Lunch Club — private collection work

**September 24, 2026: packs are withheld from the public beta at the owner's request.**
The art needs further review before public presentation. Catalogue versions and saved
ownership remain supported; this does not approve paid purchasing or a release.

24 collectible decorations and equipment appearances: 12 Regular and 12 Super. The canonical roster,
integer odds and USDC amounts are in `src/lib/chef/diner/collectible-packs.ts`.
The game, catalogue and pack page render the same Three.js models. No provider
credits, external GPU server or downloaded asset licences were needed for this pass.

## Pack rules prepared in this pass

- One collectible per pack; duplicates possible; independent openings, no pity rule.
- Regular: 5 USDC purchase; 4.99 USDC proposed redemption.
- Super: 10 USDC purchase; **9.98 USDC** proposed redemption.
- Each pool: four at 16%, four at 8.5%, then 1.19%, 0.5%, 0.3%, 0.01%.
  The supplied example summed to 100.01%; the 1.2% slot was reduced to 1.19%.
- Rarity is cosmetic. Collectibles do not increase charm, production or earnings.
- Placement supports floor, wall, countertop and ceiling pieces. NFTs must eventually
  confer a placement entitlement while owned; moving an item is not an NFT transfer.
- Keep or redeem is a choice per NFT. It is never both. Ordinary coin resale is disabled.

## Private review and existing beta items

The public game has no pack banner, pack panel, pack category, sample-opening button
or opening leaderboard. The normal game hook no longer supplies a sample ticket;
replaying a sample command is rejected without changing the save. Equipment appearance
menus only show already-owned skins, with no promotion of unowned collectibles.

Existing samples remain placeable, storable and reloadable. They have no redemption
value, mint nothing, and remain subject to the beta wipe. Neither catalogue version
is deleted. The ordinary furniture shop and regulars' keepsakes remain available.

Development-only `/chef/collection-review` and `/chef/collection-film-review` retain
isolated art review; both return not found outside development. The pack UI source is
retained for future private work but is not mounted by the public game. The separate
sample-ticket context remains available to isolated simulation tests, never to public
play or the account authority. Hiding these UI entry points is not asset encryption:
old saves still need the collectible definitions and meshes to display owned items.

Verified for this change: seven pack/decorating regression groups, including rejected
public sample commands and retained version-one/version-two ownership; TypeScript
without emitted build output; and a rendered beta fixture showing the ordinary shop
without pack promotion and a grill without unowned appearance offers. No production
deployment or new paid settlement code was performed.

The withheld opening leaderboard page has no fabricated players. The prepared
receipt reducer and SQL view rank verified paid openings, with separate Regular and
Super boards and tied ranks. Redeeming or trading does not erase an opening. Preview
draws, duplicate request IDs, duplicate chain events and repeated NFT mints cannot
increase the count. Only the original opener receives credit, not a later NFT buyer.

## Launch integration still required

See [the developers' commit/reveal design review](domain-kitchen-pack-fairness-review.md)
before selecting a randomness protocol. This is a preliminary design review, not an
audit of their referenced private contract/worker source.

The receipt migration is supplied but **not applied**. Paid purchases, minting,
redemptions, transfer indexing and the public leaderboard API are not enabled.
No client randomness, local save, connected address or submitted transaction hash
may be accepted as purchase or NFT ownership proof.

Before enabling sales, select the chain, canonical USDC address and decimals,
collection contract, treasury/redemption funding, randomness mechanism and
confirmation policy. Freeze and publish the roster/odds version used by each pack.
Use an audited payment/mint/redemption flow and a trusted receipt worker that verifies:

1. Chain, contracts, USDC amount, transaction success and finality, payer/recipient,
   purchase ID and an event not previously consumed.
2. A committed, non-rerollable randomness result against that version's integer weights.
3. NFT mint finality before inserting one immutable opening receipt. Retrying any
   stage returns the existing receipt/result without charging or minting again.
4. Current on-chain ownership for placement and redemption. Transfers revoke the
   former owner's placement and grant the new owner's entitlement exactly once.
5. Redemption atomically consumes/escrows the NFT and pays the configured amount;
   pending, reverted and reorged operations reconcile without double payout.

The planned USDC return amounts are configuration, not an implemented guarantee.
The backend must not expose a redeem button until funding and settlement are ready.
NFT ownership should use an instance inventory (chain + contract + token ID), not
the beta's aggregate `decorOwned` counts. Do not migrate beta samples into paid NFTs.

## Expanded coin shop

24 additional pieces across Walls & counters, Waiting room, Burger shop, Small-town
diner, Art deco and Garden. Waiting benches reserve two exclusive waiting places;
guests move from them into real dining seats when available. They do not add menu
orders or dining capacity. The same queue logic runs in live and offline simulation.
Half-wall panels snap on the grid. Dedicated display
counters and lobby tables have actual attachment slots; ornaments follow a moved or
rotated support and return to storage with it. Invalid placements still cannot block
required service, bathroom or dining routes. Wall decorations use existing wall mounts.

Source is on C:. Generated preview output stays on D:. Git pushes are repository
updates only. The owner alone publishes using `vercel --prod`.

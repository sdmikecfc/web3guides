# Domain Kitchen: pack fairness design review

Status: private preparation, September 24, 2026. Public pack promotion and samples
are removed from normal play. Purchases, minting, redemption and live leaderboards
remain disabled. Production remains the owner's own `vercel --prod`.

## What was actually reviewed

[The developers' published design](https://gist.github.com/hodlthedoor/5b23b16a48fa35559c8595e54775ae7c),
file `gacha-pulls-and-randomisation.md`, revision
`4f32fa08d49b839f8429179b610cfe82e81b69b8`, plus the accompanying explanation from the
owner. The gist was retrieved through GitHub's API. It references contract, worker,
randomness-service and scheduler source files, but does not include those files.
No claim here verifies their deployed code, exact encoding, permissions or solvency.

## What the design gives us

The described flow combines a secret committed before a round with data from a
paid, on-chain request and its next block. The backend computes an HMAC-SHA256 draw,
maps it into ordered weighted reward ranges, and submits the result for fulfillment.
Revealing the secret later lets an independent verifier reproduce a result, provided
all commitments, inputs, encoding and the selection algorithm are available.

This is a useful basis for **results that can be checked after reveal**. An anchored
commitment binds the operator to its secret and reward configuration. A future block
adds input unavailable before the request is included under ordinary conditions.
Neither property, alone, makes a backend fulfillment transaction self-verifying.

## Questions that must be resolved in source and contract behavior

1. **Commit before accepting payment.** The gist says commitments are served by the
   API, and the reveal is published on-chain. Confirm where the original commitments
   and round boundaries become immutable and when. An API response that the operator
   can replace is insufficient. A hash chain does not prevent replacing the entire
   chain unless an earlier hash is independently anchored. Prefer a contract-recorded
   commitment before any request assigned to the round can be accepted.

2. **Bind the whole offer.** Commit the ordered item IDs, integer weights, pack type,
   catalogue version, price, payment asset and configured redemption terms. Bind the
   algorithm version, chain and contract as well. A 10,000-weight total alone does
   not freeze which NFT occupies each range. Our current pool totals exactly 10,000
   with weights 1600 × 4, 850 × 4, 119, 50, 30 and 1. Keep old versions immutable.

3. **Fix request identity and round assignment.** Obtain the nonce, player, request
   transaction, block and log from the canonical contract event, never from client
   claims. Verify nonce scope across players, packs and contracts; include log index
   in the unique request identity when a transaction can contain multiple pulls.
   Round assignment must be fixed by a published rule at request inclusion. The
   backend must not reassign a request after it knows the result. The gist chooses
   the box from the paid amount: explicit pack/config IDs are preferable, and an
   ambiguous amount must not silently select a different pool.

4. **Specify exact bytes.** Obtain the actual randomness-service implementation and
   independent test vectors: secret hashing, round hash construction, HMAC encoding,
   address representation, nonce width/endianness, field boundaries, digest-to-integer
   conversion and weighted-range ordering. Use fixed-width or unambiguous typed
   encoding and a versioned Domain Kitchen domain separator. Do not guess a compatible
   verifier from prose. Use arbitrary-precision integer arithmetic, not JavaScript
   `Number`, for a full SHA-256 digest.

5. **Fix the future block and finality.** Use request block N + 1, not the block when
   a worker happens to wake up. Confirm both the request and that block are canonical
   under the selected chain's finality policy before settlement. Retry the same request
   using the same canonical inputs; define reorg recovery explicitly. Future block
   hashes are not a cryptographic guarantee against a colluding block producer or
   sequencer, especially if it also knows the secret. Chain selection matters.

6. **Separate detection from enforcement.** The gist says a privileged signer supplies
   the selected reward and inputs. Confirm whether the contract verifies any of the
   draw, or merely records it. After-reveal verification can expose a dishonest result,
   but does not itself stop an incorrect mint or return funds. Publish all requests,
   including unresolved ones, not only successful draws. The operator knows the
   outcome after the future block is available and could otherwise withhold fulfillment.

7. **Bound pending pulls and reveals.** The description reveals after the round ends
   and its pulls settle. One unresolved pull must not defer disclosure indefinitely.
   Close the round at a fixed boundary, freeze its requests, and define settlement and
   reveal deadlines. Specify enforceable user recovery for missed deadlines. A refund
   protects funds but does not by itself prevent an operator selectively refusing
   rare wins. If stronger prevention is required, evaluate a verifiable randomness
   source with contract-enforced fulfillment or a proof/escrow mechanism. Do not claim
   that HMAC alone supplies those guarantees. Never reveal a secret for a round still
   accepting requests; protect unrevealed secrets and rotate with secure randomness.

8. **Preserve one result per request.** Persist the result before broadcasting, use
   unique constraints and idempotent contract calls, and retry fulfillment without a
   redraw. Define what happens when minting, swaps, indexers or RPC calls fail. No
   replacement nonce or new secret is allowed to make a retry more convenient. Credit
   the opening leaderboard once only after the chosen finality/settlement rules pass.

9. **Document the probability mapping.** The gist uses digest modulo total weight.
   If it uses the complete 256-bit digest, modulo bias at a 10,000 total is negligible,
   but not mathematically zero. Exact uniform tickets can use deterministic rejection
   sampling: accept integers below floor(2^256 / total) × total, then take the remainder;
   rejected candidates use a fixed, versioned HMAC counter expansion. Do not silently
   change their algorithm in a purported compatible verifier. Confirm full-digest
   handling before treating this as negligible; truncated or floating-point handling
   could be a materially different issue.

## Payment and redemption are a separate design

Their contract swaps a selected payment-token value through Uniswap V3 and gives the
NFT a backing amount of prize tokens. Burning returns those backing tokens. That is
not the same promise as returning a fixed amount of USDC.

Domain Kitchen's proposed Regular 5 / 4.99 USDC and Super 10 / 9.98 USDC values remain
unimplemented configuration. Preserve the separate settlement, funding, ownership,
transfer and redemption requirements in the collection notes; do not copy the swap
mechanism merely because its randomness flow is useful. Gameplay sign-in remains a
message signature. A future paid purchase would be a distinct, explicit transaction.

## Evidence to request from the developers

- The exact contract and backend revision corresponding to the gist's referenced
  files, deployed addresses/chain, and an independently reproducible sample round.
- Commitment transaction, request event, N + 1 canonical block, fulfillment, reveal,
  ordered configuration and expected HMAC/ticket/item for that sample.
- Cases covering boundary tickets, multiple requests in one transaction, round
  rollover, worker retries, delayed fulfillment, reorgs and an unrevealed round.
- Proof of what the contract enforces versus what the API merely reports, and the
  user's recovery path when the operator stops processing requests.

Once those details are agreed, implement an independent verifier that works from a
downloadable proof bundle without trusting an API's “verified” badge. It must recompute
the commitment, message, draw and selected item, and distinguish cryptographic checks
from chain/finality checks. Private simulation samples are never paid receipts or
evidence that this launch protocol has been implemented.

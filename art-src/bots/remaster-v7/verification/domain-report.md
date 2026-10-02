# V7 proof 3: contact and cross-runtime replay correction

Copy authority: `PROOF3-FINAL-manifest.json` (10 domain files and 10 runner/test files). This supersedes the proof-2 source manifest. The actual hero rig and assets are unchanged; their manifest SHA256 remains `47fe5275c9c1c662acd43b28872d08afc6c1ed179140c06b616304bd0aaca8df`.

Proof-2 browser recordings did not reproduce in Node. Two pairings differed by less than 1e-12 mm of floating-point noise. Tank/Speed also showed a real 249 mm contact-anchor difference at tick 866: an already-intersecting blade selected an unstable zero-distance point, followed by a world-axis fallback for an oriented head box. Damage happened to match, but the dent location did not. Earlier same-runtime replay results did not establish cross-runtime reproducibility.

The correction is confined to v7:

- A local collision module chooses analytic box entry/exit faces, or a deterministic nearest face for a fully internal segment, and rotates the actual local normal into world space. Nearly equal contact times retain authored proxy/face order.
- Recorded event numbers are canonicalized to six decimal places before exposure and hashing (1e-6 mm for positions). Live simulation state and canonical build statistics retain their precision. Strict result checks were retained and strengthened: an edited payload with its old checksum and an edited payload with a recalculated checksum both fail replay validation.
- Rules are now `mk7-proof-3`. Earlier proof builds are explicitly incompatible; no old player save is migrated. V2–v6 source remains untouched.

## Final Node verification

| Seed 75 matchup | Final frame | Winner side | Events involving damage | Shots | Specials | Result hash |
|---|---:|---:|---:|---:|---:|---|
| Tank / Speed | 2777 | 0 | 71 | 0 | 4 | `9afc0287` |
| Tank / Ranged | 2844 | 1 | 43 | 36 | 4 | `a7f556c9` |
| Speed / Ranged | 1979 | 1 | 56 | 32 | 2 | `e956749b` |

Tank/Speed's outcome changed because corrected contact surfaces affect subsequent collisions. No damage, GP, price or balance coefficients were tuned.

The five new collision groups include the exact tick-866 recorded geometry, four tiny coordinate perturbations, local entry/exit/internal/corner cases, near-equal contact ordering, and recording precision. The corner now consistently contacts `[80,1688,-177]` with normal `[539,-45,-841]` in the collision module's normal convention (components scaled by 1000); it lies on the actual rotated local Z face.

Existing focused tests also pass: three complete matches and replays; five motion groups with 30/60/144 Hz sampling (identical hash `4b7d407b`); 35 bore checks; 514 planted-foot checks; deterministic KO floor support; snapshot rejection; damaged-arm fallback (four actual punches); and strict TypeScript. Continuity traces show no timeouts or control chains. The largest observed surviving-hand step remains 320.3 mm, so these results do not claim globally smooth rigid-body dynamics.

The new replay fixture checks full result equality, including all event anchors. Its independent local fixture completes at frame 1556, hash `35c3ad7b`, and both tampering tests pass.

## Completed browser integration check

Three fresh browser packets were captured under proof 3 in `outputs/v7-ui/proof3/preflight` and replayed through the copied final repository engine. All fields match by deep equality, including every recorded contact and dent anchor. The hashes are exactly `9afc0287`, `a7f556c9` and `e956749b`, matching the Node table above. Both stale-checksum and rehashed-event tampering tests reject the altered result. Rawls ran this browser/Node integration; earlier proof-2 packets remain diagnostic evidence. To reproduce:

```powershell
$env:BOTS_V7_RESULT_DIR='ABSOLUTE_PATH_TO_PROOF3_COMPLETE_FIGHTS'
node --preserve-symlinks --preserve-symlinks-main scripts/bots-v7-domain-check.cjs bots-v7-replay-check.ts
```

This establishes cross-runtime reproducibility for these three captured fixtures; it is not a mathematical guarantee for every browser, CPU or possible match. This remains a three-hero practice proof; there is no competitive balance, physical-mobile or deployment approval implied by the domain checks. No Reporter, shared accounting, currency, database, wallet or service operation was performed.

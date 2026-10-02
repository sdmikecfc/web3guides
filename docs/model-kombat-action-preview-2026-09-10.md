# Model Kombat action preview

## Direction

Mike rejected the earlier trailer: slow showcases and slowed gameplay did not match the desired extravagant animated action. Future trailer work needs fast, unrealistic, powerful fighting with collectible-toy charm. No further paid generations without explicit approval. The game-room increment remains intact.

Mike also requested this energy in actual battles. This increment implements an opt-in playable presentation preview over the existing deterministic fight. It is not the full new combat system, a new high-tier character catalogue, shoulder cannons, rocket punches or destructible scenery.

Open http://127.0.0.1:3000/bots/fight/demo?seed=75&showcase=1&loadout=hammer&action=1 . The query is enabled in development or with BOTS_ROOM_PREVIEW=1. Default fights retain their existing presentation and all simulation/reward rules are unchanged.

## Implemented

- Wider circling paths and rushing attacks, anticipation followed by a fast strike, grounded weapon contact, airborne overhead/backhand preparation for intact boot builds, evasive hops and strong sliding reactions.
- Wheels and missing legs do not leap; missing legs cannot dodge. Existing weapon-face solving happens after pose/root movement. The follow-through releases contact after four frames to avoid dragging a stuck weapon along with the victim.
- Pooled clay chips, blunt shock rings, blade slivers and thrust streaks. Two simultaneous effects, at most36 chips/12 streaks, expiry within0.62 seconds. Existing real geometry dents persist.
- Lower moving camera, bounded orbit/zoom, and a working steady-camera switch. System reduced motion stops playback and forces a steady frame.
- Preview pace1.6x between attacks and1.2x during attack windows. Contact pauses capped at25ms ordinary/65ms critical. No extended critical/KO slowdown in this preview.
- Preview scrubbing pauses; next-fight links retain the mode and remount the renderer for the new seed. Laptop framing reserves room for the extra toolbar.

## Verification

- Strict TypeScript passed after effects integration; final check recorded in task handoff.
- New action tests:4/4,79,244 sampled frames,218 contacts, deterministic frozen inputs, original contact phase and grounding, bounded movement and missing-leg suppression.
- Existing director7/7 including all200 legacy result hashes (aggregate9fd36ca7);864 native/GLB face-contact cases pass with maximum error0.0000.
- Effects12 checks include fixed pools, deterministic backward seeking and exact disposal; no new generated assets or per-frame geometry creation.
- Browser: action/default seed75 both retain fight code6c34c372. Completed action replay accumulated21 dents/4,812 changed vertices. Recorded hammer contacts have error0; opposing tool contact errors remained below0.014 world units in this observed fight.
- Browser playback checks:300ms gap advanced18 default/28 action frames;150ms preparation advanced8/10. Steady toggle affects the actual renderer, dynamic reduced motion stops playback, capture hook does not advance state, zero page errors in tested runs.
- Desktop1280x720 and phone390x844 inspected. Physical-phone performance and a new optimized production build were not measured. Local desktop canvas reported60FPS/~7.7ms CPU rendering at817x459 before the final effects integration; do not treat that as a final performance certification.

## Boundaries

No Doma Reporter files, services, config, shared database changes, wallet operations, paid media jobs, publishing, production deployment or unrelated working-tree edits. The previously rejected trailer has not been silently removed or replaced.

## Optional Discord draft (not sent)

We are trying a faster battle style for Model Kombat: jumping hammer attacks, quick dodges, sliding hits and flying clay. The preview has a moving-camera switch, and every fight keeps the same result and replay damage. This is a practice preview while we refine the action.

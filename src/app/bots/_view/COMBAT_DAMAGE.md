# Damage during normal fights

Updated 2026-09-08.

## What changed

The Combat Lab already deformed clay during real hits, but the main fight renderer only made sparks and detached broken parts. Normal fights now deform their own selected armour geometry on hit and block events. Blunt impacts leave craters, cutting attacks leave grooves, and thrusts leave smaller punctures. Recess shading helps damage read from the arena camera.

Damage follows each part's skeleton and survives its detachment. Replay and scrubbing rebuild the same damage from the same events. Returning to the beginning restores the original armour. The garage and another robot using the same asset stay pristine. This changes presentation only: damage amounts, rewards, seeds, timing and winners are unchanged.

## Implementation

- `combat-damage.ts` owns cloned painted armour geometry and materials. It subdivides long edges at setup without changing the pristine mould, interpolates skin weights, protects lenses, machinery, joints, weapons and cosmetics, and caps added vertices at 28,000 per robot.
- Recorded frame, struck socket, damage and attack type determine the surface location independently of camera, pose and render cadence. The older event format has no recorded impact coordinates; these visual locations are deterministic approximations on the front and flanks.
- Damage accumulation is bounded relative to the original mould. The controller does not allocate geometry during a hit or run work on every pose update.
- `arena3d.ts` delivers damage exactly once per hit/block, before the following break event captures the part. Hidden parts still receive their finishing hit. Reset and resource cleanup are separate from the per-frame pose reset.
- The modern renderer requires `NEXT_PUBLIC_BOTS_TOY_PILOT=1`. Its authored, native and mixed-part assemblies support damage. The explicit archived `renderer=legacy` view retains its old presentation.

## Verification

- Full production build and TypeScript checks pass with the modern toy, workshop, onboarding and Combat Lab flags enabled.
- All 32 starter body mould choices and all three impact types: actual vertices move, skinning stays valid, protected surfaces and other robots remain unchanged.
- Hidden finishing hits, posed/detached parts, repeated reset/replay, resource disposal, and bounded displacement after 250 critical impacts pass.
- Native mirrored left arms use absolute scale magnitudes for surface area and subdivision shares. Reflected and unreflected assemblies select the same paint and density; each arm stays within its 3,500 added-vertex share.
- First authored starter adds 14,759 vertices, within the 28,000 limit. Node timings measure setup and event processing, not frame rate.
- All 200 original engine baseline fights remain byte-identical.
- Lab regression now verifies actual combat events: 116/116 physical contacts deform armour; 23/23 flame contacts scorch without denting. Event results and damage match at 60 Hz and 15 Hz processing.
- Browser normal fight: seed 75, hammer showcase, frame 1053 has 15 dents and 4,159 changed armour vertices. Seeking to zero clears both counters; seeking back reconstructs the same values. At knockout it has 21 dents and 4,812 changed vertices, with fight code `6c34c372` unchanged.
- The desktop running fight sampled 60 FPS, around 3.42 ms CPU render time, 119 draws and 87,208 triangles. These are development-desktop samples, not mobile hardware measurements. The 390×844 phone layout had no horizontal overflow and retained damage through resize. The temporary viewport override was reset.

## Limits

The Lab still has a much wider camera during combat than its manual armour close-up. Some front-facing damage is hidden by the opponent or viewed edge-on. Fire makes scorch marks rather than dents. Geometry damage resets between matches and does not permanently damage garage assets.

Fine surface detail is still smaller on phone-sized fights. A physical phone and OS reduced-motion playback were not tested in this pass; reduced-motion uses the existing replay-to-final-frame path, which also receives damage events.

## Discord post

```text
Model Kombat damage update

• Hits now leave real dents and grooves during normal fights.
• Broken parts keep their damage when they land in the ring.
• Replays show the same damage. Restarting a fight restores the armour.
• Your chosen robot shapes, garage parts and fight results stay the same.
```

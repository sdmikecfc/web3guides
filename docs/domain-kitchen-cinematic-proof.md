# Domain Kitchen visual proof

Local review: `http://127.0.0.1:3010/chef/cinematic-review`.
This route is development-only and never reads or changes a player's save.

The live restaurant uses the normal home simulation: cashier orders, cooking,
serving, clearing and bathroom visits. The café finish toggle reuses the same
furnishings. **Up close** isolates the characters' work, walking, carrying and
eating; **Dreaming of lunch** shows the order thought bubble.

## Original runtime art

- Continuous faces, fitted cashier cap, four skinned limbs and blended actions.
- Palm support for carried plates and measured utensil reach at working stations.
- PBR paint, enamel, cloth, food and metal, with one warm shadow-casting light,
  a shared reflection environment and inexpensive floor contact shadows.
- Cream thought bubbles with trailing dots, fitted dish art, patience indicator
  and the existing dirty-dish reminder.
- Shared geometry/materials stay alive across room/catalogue use; retired actor
  skeleton textures and scene-owned lighting/contact resources are disposed.

The art still uses the game's existing furnishing geometry. This is the first
playable pass toward the trailer's look, not a claim of matching its offline
rendering or a replacement of the entire catalogue.

## Local asset tools

- `D:\Tools\game-dev\game-dev.cmd`: 1.0.2, built from the official repository's
  v1.0.2 tag, commit `944a4c4f365e9487c24fe1c7246fb7a26b129363`.
- `D:\Tools\node-game-dev\node.exe`: Node 24.21.0, isolated from project dependencies.
- `D:\Tools\Blender\blender-4.5.14-windows-x64\blender.exe`: portable Blender 4.5.14 LTS.
- Asset workspace: `D:\Doma\DomainKitchenAssets`.

The CLI wrapper provides the portable Blender path unless the caller supplies
one. Doctor reports healthy for the local production tools. No provider account
was configured, no paid generation was requested, and no Higgsfield credits
were used.

## Blender review export

`D:\Doma\DomainKitchenAssets\character-proof-v1\domain-kitchen-chef-proof.glb`
contains the original chef rig and seven baked animation loops. Its neighboring
receipts record source hashes, byte inspection, the explicit validation policy
and a successful Blender import. The export has 31,304 triangles, 17 materials,
four limb skins and a height of 1.929 m.

It is a review copy, not the game's runtime asset. Contextual tools are omitted
because core glTF does not animate their visibility. Walking remains in place;
eating expects a separate 0.47 m seat. No new reuse license is granted.

To export another review copy, choose a fresh D: folder:

```powershell
& 'D:\Tools\node-game-dev\node.exe' scripts/dk-export-character-proof.mjs --output-dir 'D:\Doma\DomainKitchenAssets\character-proof-v2'
```

## Verification

TypeScript and the eleven art/placement/picking/grounding regression suites
pass. Checks include 11,520 animation frames, face probes, real palm-to-plate
raycasts, station reach and independent skeleton disposal. A long simulated
lunch completed 74 services and washed 74 dishes without deadlock.

The browser review included the live room, café finish, character actions and
390px layout. The desktop preview typically reported 59–60 FPS. Phone-width
emulation is a layout check; representative phone hardware performance remains
to be measured. Production remains the owner's separate `vercel --prod` step.

# Modular toy pilot

`toy-pilot.blend` is the editable Blender 4.5 source. `build_pilot.py` builds the same modules and animation actions reproducibly, then exports the fight/inspection GLBs and hashed manifest into `public/bots-art/3d/pilot/`.

Run from the repository root:

```powershell
& '<your Blender 4.5 path>/blender.exe' --background --factory-startup --python art-src/bots/blender/build_pilot.py
node scripts/bots-pilot-assets-check.mjs --json
```

The meshes are created locally by the accompanying script. No paid generation provider or third-party mesh pack was used for this pilot. Keep the script, editable scene, exported files and manifest together when changing a module. Blender backup files and other raw art sources remain ignored.

The canonical skeleton has 19 bones. Left and right arm/leg modules are independent, with rigid shell weights and shared attachment coordinates. The manifest supplies catalogue identity, rig version, material regions, attachment and grip markers, movement capability and file hashes. The browser chooses complete builds before playback and provides paint, light, shadow, arena movement and event-aligned contacts.

This pilot covers the two showcase builds, a boot-and-hammer loadout and the beginner shapes. Unconverted designs and historical cosmetics retain the native renderer before the scene becomes visible. Human review of the live pilot precedes full-catalogue conversion.

# S6 art generators (rescued from session scratchpad 2026-08-22)

Generators whose OUTPUT shipped in public/s6-art/. Kept so the pipeline is
reproducible (the camo-script lesson, ADR-0110 phase 0). Paths inside point
at the dead session scratchpad; fix before reuse.

- `process_s6_front_art.py` - fortress/citadel/front set processing
- `cut_pilots.py` / `cut_pilots2.py` - pilot portrait flood-fill cutters
- `overnight_pilots.py` / `poll_juggernaut.py` - generation batch pollers
- `key_ironjaw_opponents.py` / `key_strain_bots.py` / `key_round2.py` -
  game sprite keyers
- `riot_composite.py` + `riot_cfg.json` - RIOT sprite compositing
- `compose_markers.py` / `composite_l1.py` - map marker/layer compositing

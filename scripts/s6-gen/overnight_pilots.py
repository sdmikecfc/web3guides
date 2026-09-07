# OVERNIGHT PILOT CANDIDATES (Mike's directives 2026-08-13, free local GPU):
# all 8 pilots x 2 seeds into _raw/overnight/ for his morning pick. The
# --batch APPROVED gate in the driver stays untouched; this writes candidate
# files only, nothing the site consumes.
import importlib.util
import pathlib

spec = importlib.util.spec_from_file_location(
    "pilots", r"C:/Users/Mike/Desktop/web3guides/comfy-s6-pilots.py"
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

m.RAW = pathlib.Path(r"C:/Users/Mike/Desktop/web3guides/public/s6-art/pilot/_raw/overnight")

have = m.checkpoints()
assert m.JUGG in have, have
for i, (k, body) in enumerate(m.PILOTS.items()):
    for s_i, seed in enumerate((61 + i * 13, 900 + i * 7)):
        m.generate(f"{k}-{chr(97 + s_i)}", m.pilot_prompt(body), seed, m.JUGG)
print("overnight pilots done")

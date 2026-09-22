# Website playtest package

The approved nine robot families, 48 weapon kits, parts workbench, painting,
local banners, version-8 practice combat and three animated arenas are packaged
in `public/bots-playtest`. Visit `/bots/playtest` (practice) or
`/bots/playtest?view=parts` (workbench) on the deployed website.

This is the latest practice experience, not the competitive game migration.
It does not write wallet data, award coins or alter historical robots/replays.
Practice choices are stored in the current browser; localhost choices do not
automatically transfer to a website or a phone. Balance approval remains open.

## Build and deployment

Normal Next.js builds serve the committed static package. No separate Vercel
project, ignored local folder, paid service or new credential is needed.
Use the project's normal Git deployment or existing `vercel --prod` workflow.

Runtime source is retained in `art-src/bots/personal-v8`. To rebuild it:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/bots/build-personal-site.cjs
```

This runs a strict type check, verifies the asset receipt, builds the browser
chunks and namespaces URLs under `/bots-playtest/`. Commit both changed source
and generated files after changes. The binary assets retain their original hashes.

To inspect the exact static package locally:

```powershell
node scripts/bots/serve-personal-site.cjs
```

Open `http://127.0.0.1:3160/bots/playtest`.

The asset package is approximately 488 MB in total, loaded as needed. It includes
all tiers and animation backgrounds, rather than only the currently selected
robots. Physical-phone rendering performance has not yet been measured.

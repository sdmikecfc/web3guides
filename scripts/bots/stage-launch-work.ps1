$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$targetRoot = 'D:\Temp\modelkombat-launch-work'
if ([IO.Path]::GetFullPath($targetRoot) -ne 'D:\Temp\modelkombat-launch-work') { throw 'Unexpected local build workspace.' }
New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
foreach ($dir in @('src','scripts/sql','scripts/bots','scripts/_shims','server-assets/bots8','public/bots-playtest','public/bots-art','public/s7-art/crypt/walls','art-src/bots/personal-v8')) {
  & robocopy (Join-Path $sourceRoot $dir) (Join-Path $targetRoot $dir) /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copy failed: $dir" }
}
foreach ($file in @('next.config.js','postcss.config.js','tailwind.config.ts','tsconfig.json','next-env.d.ts','.eslintrc.json')) {
  if (Test-Path -LiteralPath (Join-Path $sourceRoot $file)) { Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $targetRoot -Force }
}
foreach ($file in @('Workshop Groove.mp3','Combat Loop.mp3')) { Copy-Item -LiteralPath (Join-Path $sourceRoot "public/$file") -Destination (Join-Path $targetRoot 'public') -Force }
Write-Output 'Model Kombat source and assets staged in its own D-drive workspace. No deployment.'

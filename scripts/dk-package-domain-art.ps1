$ErrorActionPreference='Stop'
$env:TEMP='D:/Temp';$env:TMP='D:/Temp'
$root='D:/Doma/DomainKitchenAssets/three-worlds-v1'
$receipts=@()
foreach($folder in @('super-uncommon-v1','rare-gochujang-v1','rare-smoothie-v1','rare-wines-v1')) {
 foreach($file in (Get-ChildItem -LiteralPath (Join-Path $root $folder) -Filter 'domain_*.glb')) {
  $metadata=@{name=$file.BaseName;version='0.1.0-review';license='LicenseRef-Private-Project';description='Private Domain Kitchen art study. Owner and brand approval pending; not a release-ready asset.';policy=(Get-Content scripts/dk-domain-art-policy.json -Raw|ConvertFrom-Json);provenance=@{origin='authored';author='Domain Kitchen';sourceUri=$file.FullName.Replace('.glb','.blend');notes='Original locally authored Blender geometry. Editable sources and render reviews remain alongside the original export. No paid provider used. No third-party brand rights asserted.'}}
  $request=Join-Path $root 'package-request.json'
  [IO.File]::WriteAllText($request,($metadata|ConvertTo-Json -Depth 12))
  $built=(& 'D:/Tools/game-dev/game-dev.cmd' package build $file.FullName --request $request --json | Out-String)|ConvertFrom-Json
  if(-not $built.ok){throw "Package build failed: $($file.BaseName)"}
  $verified=(& 'D:/Tools/game-dev/game-dev.cmd' package verify $built.data.packagePath --json | Out-String)|ConvertFrom-Json
  if(-not $verified.ok){throw "Package verification failed: $($file.BaseName)"}
  $receipts+=@{id=$file.BaseName;built=$built.data;verification=$verified.data}
  Write-Output "PACKAGED $($file.BaseName)"
 }
}
if($receipts.Count -ne 33){throw 'Incomplete art package batch'}
[IO.File]::WriteAllText((Join-Path $root 'remaining-33-packages.json'),($receipts|ConvertTo-Json -Depth 20))

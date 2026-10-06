$ErrorActionPreference='Stop'
$env:TEMP='D:/Temp';$env:TMP='D:/Temp'
$root='D:/Doma/DomainKitchenAssets/three-worlds-v1'
$results=@()
foreach($folder in @('super-uncommon-v1','rare-gochujang-v1','rare-smoothie-v1','rare-wines-v1')) {
 foreach($file in (Get-ChildItem -LiteralPath (Join-Path $root $folder) -Filter 'domain_*.glb')) {
  $raw=& 'D:/Tools/game-dev/game-dev.cmd' asset validate $file.FullName --request scripts/dk-domain-art-policy.json --json
  $result=($raw -join "`n") | ConvertFrom-Json
  if(-not $result.ok -or -not $result.data.passed){throw "Asset validation failed: $($file.BaseName)"}
  $results+=@{id=$file.BaseName;folder=$folder;result=$result.data}
  Write-Output "PASS $($file.BaseName): $($result.data.summary.triangles) triangles, $($result.data.summary.materials) materials"
 }
}
if($results.Count -ne 33){throw "Expected 33 actual models; got $($results.Count)"}
$results | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $root 'remaining-33-validation.json') -Encoding utf8

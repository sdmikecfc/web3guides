param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference='Stop'
if (-not $Folder.StartsWith('D:/Doma/DomainKitchenAssets/three-worlds-v1/')) {throw 'D: review only'}
Add-Type -AssemblyName System.Drawing
$files=@(Get-ChildItem -LiteralPath $Folder -Filter 'domain_*.png' | Sort-Object Name)
$sheet=New-Object System.Drawing.Bitmap(1440,([int][Math]::Ceiling($files.Count/3)*520))
$graphics=[System.Drawing.Graphics]::FromImage($sheet)
$graphics.Clear([System.Drawing.Color]::FromArgb(245,236,218))
$font=New-Object System.Drawing.Font('Arial',12)
$brush=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38,62,52))
$format=New-Object System.Drawing.StringFormat
$format.Alignment=[System.Drawing.StringAlignment]::Center
try {
 for($i=0;$i -lt $files.Count;$i++) {
  $x=($i%3)*480;$y=[int][Math]::Floor($i/3)*520
  $img=[System.Drawing.Image]::FromFile($files[$i].FullName)
  try {$graphics.DrawImage($img,$x,$y,480,480)} finally {$img.Dispose()}
  $label=$files[$i].BaseName.Replace('domain_','').Replace('_',' ')
  $rect=New-Object System.Drawing.RectangleF($x,($y+488),480,32)
  $graphics.DrawString($label,$font,$brush,$rect,$format)
 }
 $dest=Join-Path $Folder 'review-sheet.jpg';$sheet.Save($dest,[System.Drawing.Imaging.ImageFormat]::Jpeg);Write-Output $dest
} finally {$format.Dispose();$brush.Dispose();$font.Dispose();$graphics.Dispose();$sheet.Dispose()}

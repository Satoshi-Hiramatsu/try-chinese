# 立ち絵をタイル状に並べた確認用シートを作る（生成結果の一括レビュー用）。
#   .\contact-sheet.ps1 -Dir web/public/portraits -Out sheet.jpg -Cols 5 -Cell 260
param(
  [Parameter(Mandatory = $true)][string]$Dir,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Cols = 5,
  [int]$Cell = 260
)

Add-Type -AssemblyName System.Drawing

$files = Get-ChildItem (Join-Path $Dir '*.jpg') | Sort-Object Name
$rows = [Math]::Ceiling($files.Count / $Cols)
$cellH = [int]($Cell * 4 / 3)
$label = 18

$sheet = New-Object System.Drawing.Bitmap ($Cols * $Cell), ($rows * ($cellH + $label))
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font = New-Object System.Drawing.Font 'Segoe UI', 9
$brush = [System.Drawing.Brushes]::Black

for ($i = 0; $i -lt $files.Count; $i++) {
  # 行番号は Floor で求める（PowerShell の [int] キャストは四捨五入するため）
  $col = $i % $Cols
  $row = [Math]::Floor($i / $Cols)
  $x = [int]($col * $Cell)
  $y = [int]($row * ($cellH + $label))
  $img = [System.Drawing.Image]::FromFile($files[$i].FullName)
  try { $g.DrawImage($img, $x, $y, $Cell, $cellH) } finally { $img.Dispose() }
  $g.DrawString($files[$i].BaseName, $font, $brush, ($x + 3), ($y + $cellH + 2))
}

$g.Dispose()
if (-not [System.IO.Path]::IsPathRooted($Out)) { $Out = Join-Path (Get-Location).Path $Out }
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)
$sheet.Save($Out, $codec, $params)
$sheet.Dispose()

Write-Output ("{0} images -> {1}" -f $files.Count, $Out)

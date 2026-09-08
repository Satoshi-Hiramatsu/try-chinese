# 生成した立ち絵（3:4）をアプリ同梱用のサイズ・画質に落とし込む。
#   .\resize-portrait.ps1 -In raw.jpg -Out web/public/portraits/pt-meiling.jpg -Width 720 -Quality 82
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 720,
  [int]$Quality = 82
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $In).Path)
try {
  $height = [int][Math]::Round($src.Height * ($Width / $src.Width))
  $dst = New-Object System.Drawing.Bitmap $Width, $height
  try {
    $g = [System.Drawing.Graphics]::FromImage($dst)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.DrawImage($src, 0, 0, $Width, $height)
    } finally { $g.Dispose() }

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
      [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

    $dir = Split-Path -Parent $Out
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    if (-not [System.IO.Path]::IsPathRooted($Out)) { $Out = Join-Path (Get-Location).Path $Out }
    $dst.Save($Out, $codec, $params)
  } finally { $dst.Dispose() }
} finally { $src.Dispose() }

Write-Output ("{0} -> {1} ({2}x{3}, {4:N0} KB)" -f $In, $Out, $Width, $height, ((Get-Item $Out).Length / 1KB))

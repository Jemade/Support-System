Add-Type -AssemblyName System.Drawing

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Clear with transparent
$graphics.Clear([System.Drawing.Color]::Transparent)

# Draw white circle background with subtle border
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$graphics.FillEllipse($whiteBrush, 8, 8, 240, 240)

$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 230, 235, 240), 2)
$graphics.DrawEllipse($borderPen, 8, 8, 240, 240)

# Avantis Brand Blue: #0284c7 (or #13A3AF)
$brandColor = [System.Drawing.Color]::FromArgb(255, 2, 132, 199)
$pen = New-Object System.Drawing.Pen($brandColor, 22)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

# 1. Left Arrow Pointing UP ('^') - Completely independent with distinct spacing
$p1 = New-Object System.Drawing.PointF(48, 152)
$p2 = New-Object System.Drawing.PointF(88, 104)
$p3 = New-Object System.Drawing.PointF(128, 152)
$pointsUp = @($p1, $p2, $p3)
$graphics.DrawLines($pen, $pointsUp)

# 2. Right Arrow Pointing DOWN ('v') - Completely independent with distinct spacing
$p4 = New-Object System.Drawing.PointF(134, 104)
$p5 = New-Object System.Drawing.PointF(174, 152)
$p6 = New-Object System.Drawing.PointF(214, 104)
$pointsDown = @($p4, $p5, $p6)
$graphics.DrawLines($pen, $pointsDown)

# Save PNGs to UI and Agent
$assetsDir = "c:\Users\mapas\OneDrive\Desktop\project_support\project_support\client-ui\assets"
if (!(Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir -Force }
$pngPath = "$assetsDir\avantis_logo.png"
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$agentAssetPath = "c:\Users\mapas\OneDrive\Desktop\project_support\project_support\agent\src\notifications\avantis_logo.png"
$bitmap.Save($agentAssetPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Create 64x64 and 32x32 ICO for Windows Shortcut and Tab Favicon
$icoBitmap = New-Object System.Drawing.Bitmap($bitmap, 64, 64)
$hIcon = $icoBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$icoPath = "$assetsDir\favicon.ico"
$agentIcoPath = "c:\Users\mapas\OneDrive\Desktop\project_support\project_support\agent\src\notifications\avantis.ico"

$fileStream = [System.IO.File]::OpenWrite($icoPath)
$icon.Save($fileStream)
$fileStream.Close()

$fileStream2 = [System.IO.File]::OpenWrite($agentIcoPath)
$icon.Save($fileStream2)
$fileStream2.Close()

Write-Output "Saved Avantis Logo Assets (PNG & ICO) with separated chevrons and spacing."

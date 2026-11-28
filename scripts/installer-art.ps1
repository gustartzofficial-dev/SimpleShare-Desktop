$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$assetDirectory=Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri/installer'
New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
function Write-InstallerArt([int]$width,[int]$height,[string]$name,[bool]$sidebar){
 $bitmap=[Drawing.Bitmap]::new($width,$height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
 $graphics=[Drawing.Graphics]::FromImage($bitmap)
 $graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
 $graphics.TextRenderingHint=[Drawing.Text.TextRenderingHint]::ClearTypeGridFit
 $background=if($sidebar){'#172015'}else{'#FFFFFF'}
 $graphics.Clear([Drawing.ColorTranslator]::FromHtml($background))
 $accent=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#F29A78'),2)
 $ink=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($(if($sidebar){'#F2F0E8'}else{'#172015'})))
 $muted=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#C4D297'))
 if($sidebar){
  $graphics.DrawRectangle($accent,22,30,44,38);$graphics.DrawRectangle($accent,42,50,44,38)
  $title=[Drawing.Font]::new('Segoe UI',17,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
  $copy=[Drawing.Font]::new('Segoe UI',13,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
  $small=[Drawing.Font]::new('Segoe UI',9,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
  $graphics.DrawString('SimpleShare.',$title,$ink,17,119)
  $graphics.DrawString("One screen.`nGood company.",$copy,$muted,20,156)
  $graphics.DrawLine($accent,20,256,142,256)
  $graphics.DrawString('MAKE YOURSELF AT HOME',$small,$muted,20,276)
  $title.Dispose();$copy.Dispose();$small.Dispose()
 }else{
  $graphics.DrawRectangle($accent,10,15,24,21);$graphics.DrawRectangle($accent,21,25,24,21)
  $font=[Drawing.Font]::new('Segoe UI',14,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
  $graphics.DrawString('SimpleShare.',$font,$ink,51,20);$font.Dispose()
 }
 $bitmap.Save((Join-Path $assetDirectory ($name+'.bmp')),[Drawing.Imaging.ImageFormat]::Bmp)
 $bitmap.Save((Join-Path $assetDirectory ($name+'.png')),[Drawing.Imaging.ImageFormat]::Png)
 $accent.Dispose();$ink.Dispose();$muted.Dispose();$graphics.Dispose();$bitmap.Dispose()
}
Write-InstallerArt 164 314 'sidebar' $true
Write-InstallerArt 150 57 'header' $false

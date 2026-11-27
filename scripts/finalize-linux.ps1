param(
 [Parameter(Mandatory=$true)][string]$AssetsDirectory,
 [string]$ReleaseTag='v0.4.0',
 [Parameter(Mandatory=$true)][string]$SigningKeyPath
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
# This repository can use its own portable toolchain; the owner's existing E: toolchain is also supported.
$existingEnv='E:\SimpleShare-Major Update\desktop-tauri\scripts\env.ps1'
if(Test-Path -LiteralPath $existingEnv){. $existingEnv}else{. (Join-Path $PSScriptRoot 'env.ps1')}
if($env:TEMP -match '^C:') {throw 'Configure the build environment on a non-C drive first.'}
$version=(Get-Content package.json -Raw | ConvertFrom-Json).version
$release=Join-Path $projectRoot "release/v$version"
New-Item -ItemType Directory -Force -Path $release | Out-Null
$images=@(Get-ChildItem -LiteralPath $AssetsDirectory -Filter '*.AppImage' -File)
$debs=@(Get-ChildItem -LiteralPath $AssetsDirectory -Filter '*.deb' -File)
if($images.Count -ne 1 -or $debs.Count -ne 1){throw 'Choose the extracted Linux build artifact folder with one AppImage and one .deb.'}
if($images[0].Name -notlike "*_${version}_*" -or $debs[0].Name -notlike "*_${version}_*"){throw 'Linux artifacts do not match this project version.'}
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''
& './node_modules/.bin/tauri.cmd' signer sign --private-key-path $SigningKeyPath --app-version $version $images[0].FullName
if($LASTEXITCODE){throw 'Linux updater signing failed'}
foreach($file in @($images[0].FullName,($images[0].FullName+'.sig'),$debs[0].FullName,(Join-Path $projectRoot 'Install-SimpleShare.sh'))){Copy-Item -LiteralPath $file -Destination $release -Force}
node scripts/release-manifest.mjs --assets $release --tag $ReleaseTag --require-linux
if($LASTEXITCODE){throw 'Release manifest generation failed'}
Write-Host "Combined Windows + Linux release ready: $release"

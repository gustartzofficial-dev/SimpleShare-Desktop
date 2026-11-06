$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot '.local'
if (Test-Path -LiteralPath (Join-Path $localRoot 'cargo/bin/cargo.exe')) {
 $env:CARGO_HOME=Join-Path $localRoot 'cargo'
 $env:RUSTUP_HOME=Join-Path $localRoot 'rustup'
 $env:PATH=(Join-Path $localRoot 'cargo/bin')+';'+$env:PATH
}
$env:CARGO_TARGET_DIR=Join-Path $localRoot 'target'
$env:TEMP=Join-Path $localRoot 'tmp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$msvc=Join-Path $localRoot 'toolchain/msvc'
if(Test-Path -LiteralPath $msvc){
 $tool='14.44.35207';$sdk='10.0.26100.0'
 $env:VCToolsInstallDir=Join-Path $msvc "VC/Tools/MSVC/$tool/"
 $env:WindowsSdkDir=Join-Path $msvc 'Windows Kits/10/'
 $env:WindowsSDKVersion=$sdk+'\'
 $env:PATH=(Join-Path $msvc "VC/Tools/MSVC/$tool/bin/Hostx64/x64")+';'+(Join-Path $msvc "Windows Kits/10/bin/$sdk/x64")+';'+$env:PATH
 $env:INCLUDE=(Join-Path $msvc "VC/Tools/MSVC/$tool/include")+';'+(Join-Path $msvc "Windows Kits/10/Include/$sdk/ucrt")+';'+(Join-Path $msvc "Windows Kits/10/Include/$sdk/shared")+';'+(Join-Path $msvc "Windows Kits/10/Include/$sdk/um")+';'+(Join-Path $msvc "Windows Kits/10/Include/$sdk/winrt")
 $env:LIB=(Join-Path $msvc "VC/Tools/MSVC/$tool/lib/x64")+';'+(Join-Path $msvc "Windows Kits/10/Lib/$sdk/ucrt/x64")+';'+(Join-Path $msvc "Windows Kits/10/Lib/$sdk/um/x64")
}

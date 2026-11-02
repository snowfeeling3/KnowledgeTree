param([switch]$PublishUpdate,[string]$ArtifactBaseUrl,[string]$ReleaseNotesFile,[string]$Toolchain='stable-x86_64-pc-windows-gnu')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Push-Location $taskRoot
$taskOriginalToolchain=$env:RUSTUP_TOOLCHAIN
$taskUtf8=New-Object System.Text.UTF8Encoding($false)
try {
    $env:RUSTUP_TOOLCHAIN=$Toolchain
    $taskConfig=Get-Content -Raw apps/desktop/src-tauri/tauri.conf.json | ConvertFrom-Json
    $taskVersion=$taskConfig.version
    foreach ($taskManifest in @('package.json','frontend/package.json','apps/desktop/package.json')) {
        if ((Get-Content -Raw $taskManifest | ConvertFrom-Json).version -ne $taskVersion) { throw "Version mismatch: $taskManifest" }
    }
    & cargo test --workspace --release; if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }
    & pnpm test:ui; if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
    $taskBuildArgs=@('--dir','apps/desktop','build')
    if ($PublishUpdate) {
        if (-not $ArtifactBaseUrl -or -not $ArtifactBaseUrl.StartsWith('https://')) { throw 'HTTPS artifact base URL required for latest.json' }
        if (-not $env:KNOWLEDGE_TREE_UPDATE_URL -or -not $env:KNOWLEDGE_TREE_UPDATE_URL.StartsWith('https://')) { throw 'HTTPS update URL required' }
        if (-not $env:KNOWLEDGE_TREE_UPDATE_PUBLIC_KEY -or -not $env:TAURI_SIGNING_PRIVATE_KEY) { throw 'Public key and protected private signing key required' }
        $taskOverlay=@{ bundle=@{createUpdaterArtifacts=$true}; plugins=@{updater=@{pubkey=$env:KNOWLEDGE_TREE_UPDATE_PUBLIC_KEY;endpoints=@($env:KNOWLEDGE_TREE_UPDATE_URL)}}} | ConvertTo-Json -Depth 5 -Compress
        $taskOverlayPath=Join-Path $taskRoot 'artifacts/release-publish-config.json'
        [IO.File]::WriteAllText($taskOverlayPath,$taskOverlay,$taskUtf8)
        $taskBuildArgs+=@('--config',$taskOverlayPath)
    }
    & pnpm @taskBuildArgs; if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
    $taskOutput=Join-Path $taskRoot "dist/releases/$taskVersion"
    if (Test-Path -LiteralPath $taskOutput) { throw 'Release directory already exists; review existing release instead of overwriting it' }
    New-Item -ItemType Directory -Path $taskOutput | Out-Null
    Copy-Item -LiteralPath 'target/release/knowledge-tree-desktop.exe' -Destination $taskOutput
    if (Test-Path -LiteralPath 'target/release/WebView2Loader.dll') { Copy-Item -LiteralPath 'target/release/WebView2Loader.dll' -Destination $taskOutput }
    $taskInstaller=Get-ChildItem 'target/release/bundle/nsis' -Filter "*${taskVersion}*setup.exe" | Select-Object -First 1
    if (-not $taskInstaller) {throw 'Versioned NSIS installer missing'}
    Copy-Item -LiteralPath $taskInstaller.FullName -Destination $taskOutput
    if ($PublishUpdate) {
        $taskSignature=$taskInstaller.FullName+'.sig'
        if (-not (Test-Path -LiteralPath $taskSignature)) {throw 'Signed updater artifact missing'}
        Copy-Item -LiteralPath $taskSignature -Destination $taskOutput
        $taskNotes=if ($ReleaseNotesFile) {Get-Content -LiteralPath $ReleaseNotesFile -Raw} else {"KnowledgeTree $taskVersion"}
        $taskLatest=@{version=$taskVersion;notes=$taskNotes;pub_date=[DateTime]::UtcNow.ToString('o');platforms=@{'windows-x86_64'=@{url=$ArtifactBaseUrl.TrimEnd('/')+'/'+[Uri]::EscapeDataString($taskInstaller.Name);signature=(Get-Content -LiteralPath $taskSignature -Raw).Trim()}}}
        [IO.File]::WriteAllText((Join-Path $taskOutput 'latest.json'),($taskLatest | ConvertTo-Json -Depth 5),$taskUtf8)
    }
    $taskHashes=Get-ChildItem -LiteralPath $taskOutput -File | Get-FileHash -Algorithm SHA256 | Select-Object @{Name='file';Expression={Split-Path $_.Path -Leaf}},Hash | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $taskOutput 'sha256.json'),$taskHashes,$taskUtf8)
    Write-Output "Prepared $taskOutput. Run isolated installer/update acceptance before publishing."
} finally { $env:RUSTUP_TOOLCHAIN=$taskOriginalToolchain; Pop-Location }

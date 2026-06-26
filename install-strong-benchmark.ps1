# Run this from: C:\laragon\www\LO
# It backs up the current benchmark files and installs the stronger benchmark files from this folder.

$ErrorActionPreference = "Stop"

$Root = Get-Location
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = Join-Path $Root "benchmark-backup-$Stamp"

$Files = @(
  "packages-galerina\galerina-core\examples\compute-mix-throughput-benchmark.node.js",
  "packages-galerina\galerina-core\examples\compute-mix-throughput-benchmark.py",
  "packages-galerina\galerina-core\examples\benchmark-runner.node.js",
  "packages-galerina\galerina-core\examples\compute-mix-throughput-benchmark.spore",
  "packages-galerina\galerina-core\examples\BENCHMARK-V2-README.md"
)

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

foreach ($File in $Files) {
  $Target = Join-Path $Root $File

  if (Test-Path $Target) {
    $BackupTarget = Join-Path $BackupDir $File
    New-Item -ItemType Directory -Force -Path (Split-Path $BackupTarget) | Out-Null
    Copy-Item $Target $BackupTarget
  }

  $Source = Join-Path $PSScriptRoot $File
  if (!(Test-Path $Source)) {
    throw "Missing source file: $Source"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $Target) | Out-Null
  Copy-Item $Source $Target -Force
}

Write-Host "Installed strong benchmark files."
Write-Host "Backup created at: $BackupDir"
Write-Host ""
Write-Host "Validation run:"
Write-Host "node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 3 --operations 5000000 --warmup-ms 1000 --batch-size 100000 --buffer-size 65536"
Write-Host ""
Write-Host "Full benchmark:"
Write-Host "node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536"

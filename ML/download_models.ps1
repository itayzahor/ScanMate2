<#
.SYNOPSIS
    Downloads the trained YOLO model weights from GitHub Releases.
.DESCRIPTION
    Places the weights in the paths expected by scripts/detectors.py:
      ML/runs/corners_11x_640_v2/weights/best.pt
      ML/runs/pieces_11x_640_v1/weights/best.pt

    Update $RELEASE_URL below to point at your GitHub release tag once
    you have uploaded the .pt files as release assets.
#>

# ── Update this URL to your GitHub release ──────────────────────────────────
$REPO       = "itayzahor/ScanMate2"
$RELEASE_TAG = "v1.0-models"          # change to match the tag you create
$BASE_URL   = "https://github.com/$REPO/releases/download/$RELEASE_TAG"
# ────────────────────────────────────────────────────────────────────────────

$models = @(
    @{ Dest = "runs\corners_11x_640_v2\weights\best.pt"; File = "corners_best.pt" },
    @{ Dest = "runs\pieces_11x_640_v1\weights\best.pt";  File = "pieces_best.pt"  }
)

$scriptDir = $PSScriptRoot

foreach ($m in $models) {
    $destPath = Join-Path $scriptDir $m.Dest
    if (Test-Path $destPath) {
        Write-Host "Already exists, skipping: $($m.Dest)" -ForegroundColor Yellow
        continue
    }

    $dir = Split-Path $destPath
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    $url = "$BASE_URL/$($m.File)"
    Write-Host "Downloading $($m.File) ..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $url -OutFile $destPath -UseBasicParsing
        Write-Host "  Saved to $destPath" -ForegroundColor Green
    } catch {
        Write-Host "  FAILED: $_" -ForegroundColor Red
        Write-Host "  Download manually from: $url" -ForegroundColor Red
    }
}

Write-Host "Done." -ForegroundColor Green

# sync-stats-backfill.ps1
# Backfills stats for all schools across completed weeks using batched requests.
# Each request processes batchSize schools so it stays under the function timeout.
#
# Usage:
#   .\scripts\sync-stats-backfill.ps1 -Week 1
#   .\scripts\sync-stats-backfill.ps1 -Week 1 -StartWeek 1 -EndWeek 11
#   .\scripts\sync-stats-backfill.ps1 -BaseUrl http://localhost:3000

param(
  [int]    $Week      = 0,          # Single week (ignored if StartWeek/EndWeek set)
  [int]    $StartWeek = 0,          # Range start
  [int]    $EndWeek   = 0,          # Range end
  [int]    $BatchSize = 10,         # Schools per request (keep under timeout)
  [int]    $NumBatches = 8,         # 8 × 10 = 80 schools covers all P4+Ind
  [string] $BaseUrl   = "https://collegeunitsfantasy.com",
  [string] $Secret    = $env:CRON_SECRET
)

if (-not $Secret) {
  Write-Error "CRON_SECRET env var not set. Run: `$env:CRON_SECRET = 'your-secret'"
  exit 1
}

$headers = @{ Authorization = "Bearer $Secret" }

# Build week list
$weeks = @()
if ($StartWeek -gt 0 -and $EndWeek -gt 0) {
  $weeks = $StartWeek..$EndWeek
} elseif ($Week -gt 0) {
  $weeks = @($Week)
} else {
  Write-Error "Provide -Week N or -StartWeek N -EndWeek N"
  exit 1
}

foreach ($w in $weeks) {
  Write-Host "`n=== Week $w ===" -ForegroundColor Cyan

  for ($batch = 0; $batch -lt $NumBatches; $batch++) {
    $url = "$BaseUrl/api/cron/sync-stats?week=$w&batch=$batch&batchSize=$BatchSize"
    Write-Host "  Batch $batch → $url" -NoNewline

    try {
      $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 120
      $schools = ($resp.schools -join ", ")
      Write-Host "  OK — $($resp.statsUpdated) rows, $($resp.duration)ms [$schools]" -ForegroundColor Green
    } catch {
      Write-Host "  FAILED: $_" -ForegroundColor Red
    }

    # Small delay between batches to avoid DB connection saturation
    Start-Sleep -Milliseconds 500
  }
}

Write-Host "`nDone." -ForegroundColor Cyan

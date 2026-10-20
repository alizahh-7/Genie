# Run while "npm run dev" is active in another terminal.
$fail = 0
foreach ($r in "/","/demo","/start") {
  try { $s = (Invoke-WebRequest -UseBasicParsing "http://localhost:3000$r").StatusCode } catch { $s = "ERR" }
  if ($s -eq 200) { Write-Host "OK   $r" -ForegroundColor Green } else { Write-Host "FAIL $r ($s)" -ForegroundColor Red; $fail++ }
}
try { $p = Invoke-RestMethod "https://genie-ld8p.onrender.com/demo/personas" -TimeoutSec 90; Write-Host "OK   backend demo personas: $($p.Count)" -ForegroundColor Green } catch { Write-Host "FAIL backend unreachable" -ForegroundColor Red; $fail++ }
if ($fail -eq 0) { Write-Host "Phase 1 checks passed." -ForegroundColor Green } else { exit 1 }

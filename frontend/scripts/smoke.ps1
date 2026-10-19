# Run while "npm run dev" is active in another terminal.
$routes = "/","/start","/hospice","/circle/test-token","/person/demo/portrait","/person/demo/wishes","/person/demo/reaction","/person/demo/bedside-kit","/person/demo/compare","/person/demo/wish-book"
$fail = 0
foreach ($r in $routes) {
  try { $s = (Invoke-WebRequest -UseBasicParsing "http://localhost:3000$r").StatusCode } catch { $s = "ERR" }
  if ($s -eq 200) { Write-Host "OK   $r" -ForegroundColor Green } else { Write-Host "FAIL $r ($s)" -ForegroundColor Red; $fail++ }
}
if ($fail -eq 0) { Write-Host "All screens load. Frontend role is done." -ForegroundColor Green } else { exit 1 }

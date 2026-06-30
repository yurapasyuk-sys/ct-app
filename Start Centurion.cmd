@echo off
setlocal

set "APP_URL=http://127.0.0.1:8080/#/backtest-reports"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$project = Split-Path -Parent '%~f0';" ^
  "$appUrl = '%APP_URL%';" ^
  "$isRunning = $false;" ^
  "try { Invoke-WebRequest -Uri 'http://127.0.0.1:8080' -UseBasicParsing -TimeoutSec 2 | Out-Null; $isRunning = $true } catch { $isRunning = $false }" ^
  "if (-not $isRunning) { Start-Process -FilePath 'cmd.exe' -WorkingDirectory $project -ArgumentList @('/k', 'npm.cmd run dev -- --host 127.0.0.1 --port 8080'); Start-Sleep -Seconds 5 }" ^
  "Start-Process $appUrl"

endlocal

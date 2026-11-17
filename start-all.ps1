# Starts the three PtmGPT services, each in its own PowerShell window.
#   - Python AI service (MedGemma) on :8001
#   - Node backend on :8080
#   - Vite frontend on :5173
# Usage: right-click -> Run with PowerShell, or:  .\start-all.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$py = $null
foreach ($candidate in @(
    Join-Path $root "PtmGPT-AI-Server\.venv\Scripts\python.exe",
    Join-Path $root ".venv\Scripts\python.exe"
)) {
    if (Test-Path -LiteralPath $candidate) { $py = $candidate; break }
}
if (-not $py) { $py = "python" }

Write-Host "Starting Python AI service (:8001)..."
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle='PtmGPT AI :8001'; Set-Location '$($root)\PtmGPT-AI-Server'; & '$py' ai_server.py"
)

Write-Host "Starting Node backend (:8080)..."
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle='PtmGPT Backend :8080'; Set-Location '$($root)\Backend'; npm start"
)

Write-Host "Starting frontend (:5173)..."
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle='PtmGPT Frontend :5173'; Set-Location '$($root)\Frontend'; npm run dev"
)

Write-Host ""
Write-Host "All three services launching. The AI model takes ~20s to load on CPU."
Write-Host "Check readiness:  http://127.0.0.1:8001/health  and  http://127.0.0.1:8080/api/ai/status"

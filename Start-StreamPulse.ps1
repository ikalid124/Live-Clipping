param([switch]$Background)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 22.17 or later, then reopen PowerShell.'
    }
    if ($Background) {
        try {
            $existing = Invoke-RestMethod 'http://127.0.0.1:8765/api/state' -TimeoutSec 2
            if ($existing.diagnostics) {
                Write-Output 'StreamPulse is already running at http://localhost:8765/?source=Twitch'
                return
            }
        } catch {}
        Start-Process -FilePath (Get-Command node).Source -ArgumentList '--env-file-if-exists=.env','server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 250
            try {
                $ready = Invoke-RestMethod 'http://127.0.0.1:8765/api/state' -TimeoutSec 2
                if ($ready.diagnostics) {
                    Write-Output 'StreamPulse is running in the background at http://localhost:8765/?source=Twitch'
                    return
                }
            } catch {}
        }
        throw 'StreamPulse did not become ready. Run ./Start-StreamPulse.ps1 in the foreground to see its startup error.'
    }
    node --env-file-if-exists=.env server.js
    exit $LASTEXITCODE
} finally {
    Pop-Location
}


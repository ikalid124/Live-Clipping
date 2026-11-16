$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 22.17 or later, then reopen PowerShell.'
    }
    node --env-file-if-exists=.env server.js
    exit $LASTEXITCODE
} finally {
    Pop-Location
}


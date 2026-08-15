$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $repoRoot
try {
    docker compose down --remove-orphans
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose could not stop the application."
    }

    Write-Host "Application stopped. Board data in data/ was preserved."
}
finally {
    Pop-Location
}

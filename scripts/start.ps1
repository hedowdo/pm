$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $repoRoot ".env"

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Missing .env. Copy .env.example to .env and set OPENROUTER_API_KEY."
}

Push-Location $repoRoot
try {
    docker compose up --build --detach --wait
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose could not start the application."
    }

    Write-Host "Application ready at http://localhost:8000"
}
finally {
    Pop-Location
}

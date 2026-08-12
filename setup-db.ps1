# ---------------------------------------------------------------------------
# One-shot database setup. Run after PostgreSQL 14 or newer is installed:
#
#   powershell -ExecutionPolicy Bypass -File setup-db.ps1
#
# Creates the bsbw_crm database, applies the schema, creates the BSBW and CCM
# organizations, and loads the demo rows.
#
# Safe to re-run: the database is only created if missing, the schema is all
# IF NOT EXISTS, and the seed refuses to duplicate itself. Running it against a
# database from before the multi-organization change migrates it in place -
# everything already in there becomes BSBW's.
#
# Override the superuser password with $env:PGPASSWORD before running.
#
# There is no sign-in. Set ADMIN_EMAIL and ADMIN_PASSWORD in server\.env before
# this runs anywhere other people can reach - they gate creating and deleting
# an organization.
#
# NOTE: deliberately ASCII-only. Windows PowerShell 5.1 reads a BOM-less file
# as ANSI, so a stray em-dash or curly quote in here is a parse error.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Stop"

$node = "C:\Program Files\nodejs"

# psql lives under a per-major-version folder, so pinning one goes stale the
# next time Postgres is upgraded. Take the newest installed instead. A folder
# whose name isn't a number sorts last rather than blowing up the cast.
$psql = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object { $_.Directory.Parent.Name -as [int] } -Descending |
        Select-Object -First 1 -ExpandProperty FullName

if (-not $env:PGPASSWORD) { $env:PGPASSWORD = "postgres" }
if (-not $psql) { throw "psql not found under C:\Program Files\PostgreSQL - is PostgreSQL installed?" }
Write-Host "-- using $psql"

$env:Path = "$node;" + $env:Path

Write-Host "-- creating database (skipped if it already exists)"
$exists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='bsbw_crm'"
if ($exists -ne "1") {
    & $psql -U postgres -h localhost -c "CREATE DATABASE bsbw_crm;"
    Write-Host "   created bsbw_crm"
} else {
    Write-Host "   bsbw_crm already there"
}

Set-Location (Join-Path $PSScriptRoot "server")

Write-Host "-- applying schema"
npm run migrate
if ($LASTEXITCODE -ne 0) { throw "migrate failed" }

Write-Host "-- loading demo rows"
npm run seed
if ($LASTEXITCODE -ne 0) { throw "seed failed" }

Write-Host ""
Write-Host "Done. Start the two halves in separate terminals:"
Write-Host "   npm run dev:api    (from the repo root)"
Write-Host "   npm run dev:web"
Write-Host ""
Write-Host "Then open http://localhost:5173 and pick an organization. No sign-in."

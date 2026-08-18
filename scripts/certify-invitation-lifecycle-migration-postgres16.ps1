[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repositoryRoot

$runId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$container = "invitation_lifecycle_certification_$runId"
$dbUser = 'invitation_certifier'
$dbPassword = 'invitation_certifier_password'
$cleanDatabase = "invitation_clean_$runId`_test"
$legacyDatabase = "invitation_legacy_$runId`_test"
$invalidDatabase = "invitation_invalid_$runId`_test"
$rollbackDatabase = "invitation_rollback_$runId`_test"
$migrationName = '20260723120000_add_invitation_membership_lifecycle'
$migrationRoot = Join-Path $repositoryRoot 'prisma/migrations'
$priorMigrations = Get-ChildItem $migrationRoot -Directory |
  Where-Object Name -ne $migrationName |
  Sort-Object Name

function Get-DatabaseUrl([string]$database) {
  return "postgresql://${dbUser}:${dbPassword}@127.0.0.1:$script:postgresPort/$database`?schema=public"
}

function Invoke-Psql([string]$database, [string]$sql) {
  # Windows PowerShell's native-command argument marshalling drops embedded
  # double quotes unless they are escaped for Docker's argument boundary.
  $sqlForDocker = $sql -replace '"', '\"'
  & docker exec $container psql -v ON_ERROR_STOP=1 -U $dbUser -d $database -c $sqlForDocker
  if ($LASTEXITCODE -ne 0) { throw "psql failed for disposable database $database" }
}

function New-DisposableDatabase([string]$database) {
  Invoke-Psql 'postgres' "CREATE DATABASE `"$database`" TEMPLATE template0;"
}

function Invoke-Prisma([string]$database, [string[]]$arguments) {
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = Get-DatabaseUrl $database
    & npx.cmd --no-install prisma @arguments | Out-Host
    $exitCode = $LASTEXITCODE
    return $exitCode
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}

function Apply-PriorMigrations([string]$database) {
  foreach ($migration in $priorMigrations) {
    $containerPath = "/tmp/$($migration.Name).sql"
    & docker cp (Join-Path $migration.FullName 'migration.sql') "${container}:$containerPath"
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy a prior migration into the disposable PostgreSQL container' }
    & docker exec $container psql -v ON_ERROR_STOP=1 -U $dbUser -d $database -f $containerPath
    if ($LASTEXITCODE -ne 0) { throw "Prior migration $($migration.Name) failed" }
    if ((Invoke-Prisma $database @('migrate', 'resolve', '--applied', $migration.Name)) -ne 0) {
      throw "Could not mark prior migration $($migration.Name) as applied in the disposable database"
    }
  }
}

function Assert-SqlFails([string]$database, [string]$sql, [string]$description) {
  $sqlForDocker = $sql -replace '"', '\"'
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & docker exec $container psql -v ON_ERROR_STOP=1 -U $dbUser -d $database -c $sqlForDocker 2>$null | Out-Null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -eq 0) { throw "Expected PostgreSQL to reject $description" }
}

function Add-Invitation([string]$database, [string]$id, [string]$digest, [string]$email, [string]$normalizedEmail) {
  Invoke-Psql $database @"
INSERT INTO "organization_invitations" ("id", "organizationId", "email", "normalizedEmail", "role", "tokenDigest", "expiresAt", "updatedAt")
VALUES ('$id', '00000000-0000-0000-0000-000000000001', '$email', '$normalizedEmail', 'PSYCHOLOGIST', '$digest', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP);
"@
}

try {
  & docker run -d --name $container -e "POSTGRES_USER=$dbUser" -e "POSTGRES_PASSWORD=$dbPassword" -e POSTGRES_DB=postgres -p '127.0.0.1::5432' postgres:16-alpine *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable PostgreSQL 16 container' }

  $postgresPort = ((& docker port $container '5432/tcp') | Select-Object -First 1).Split(':')[-1]
  if (-not $postgresPort) { throw 'Could not resolve the disposable PostgreSQL port' }
  $ready = $false
  foreach ($attempt in 1..30) {
    & docker exec $container pg_isready -U $dbUser -d postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Disposable PostgreSQL 16 did not become ready' }

  # Clean database: full migration chain, named constraints/index, and
  # idempotent deploy.
  New-DisposableDatabase $cleanDatabase
  if ((Invoke-Prisma $cleanDatabase @('migrate', 'deploy')) -ne 0) { throw 'Clean migration deployment failed' }
  if ((Invoke-Prisma $cleanDatabase @('migrate', 'deploy')) -ne 0) { throw 'Clean migration deployment was not idempotent' }
  Invoke-Psql $cleanDatabase @'
INSERT INTO "organizations" ("id", "slug", "legalName", "displayName", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'invitation-certification', 'Invitation Certification', 'Invitation Certification', CURRENT_TIMESTAMP);
'@
  $objectsSql = @'
SELECT count(*)
FROM pg_constraint
WHERE conname IN (
  'organization_invitations_one_terminal_state_check',
  'organization_invitations_expired_at_after_expires_at_check',
  'organization_invitations_accepted_by_requires_accepted_at_check'
)
UNION ALL
SELECT count(*) FROM pg_indexes WHERE indexname = 'organization_invitations_organizationId_normalizedEmail_pending_key';
'@
  $objects = & docker exec $container psql -v ON_ERROR_STOP=1 -U $dbUser -d $cleanDatabase -Atc ($objectsSql -replace '"', '\"')
  $objectCounts = @($objects | ForEach-Object { [int]$_ })
  if ($objectCounts.Count -ne 2 -or $objectCounts[0] -ne 3 -or $objectCounts[1] -ne 1) {
    throw 'Expected invitation lifecycle constraints or partial index is missing'
  }

  Add-Invitation $cleanDatabase '00000000-0000-0000-0000-000000000101' ('a' * 64) 'terminal@example.test' 'terminal@example.test'
  Assert-SqlFails $cleanDatabase @'
UPDATE "organization_invitations"
SET "acceptedAt" = CURRENT_TIMESTAMP, "rejectedAt" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000101';
'@ 'a double terminal state'
  Invoke-Psql $cleanDatabase @'
UPDATE "organization_invitations" SET "rejectedAt" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-0000-0000-000000000101';
'@
  Add-Invitation $cleanDatabase '00000000-0000-0000-0000-000000000102' ('b' * 64) 'terminal@example.test' 'terminal@example.test'

  # Two transactions contend for one pending key. Exactly one must commit.
  $firstRaceSql = @'
BEGIN;
INSERT INTO "organization_invitations" ("id", "organizationId", "email", "normalizedEmail", "role", "tokenDigest", "expiresAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'race@example.test', 'race@example.test', 'PSYCHOLOGIST', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP);
SELECT pg_sleep(2);
COMMIT;
'@
  $secondRaceSql = @'
INSERT INTO "organization_invitations" ("id", "organizationId", "email", "normalizedEmail", "role", "tokenDigest", "expiresAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'race@example.test', 'race@example.test', 'PSYCHOLOGIST', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP);
'@
  $first = Start-Job -ScriptBlock {
    param($containerName, $user, $database, $sql)
    & docker exec $containerName psql -v ON_ERROR_STOP=1 -U $user -d $database -c ($sql -replace '"', '\"')
    exit $LASTEXITCODE
  } -ArgumentList $container, $dbUser, $cleanDatabase, $firstRaceSql
  Start-Sleep -Milliseconds 200
  $second = Start-Job -ScriptBlock {
    param($containerName, $user, $database, $sql)
    & docker exec $containerName psql -v ON_ERROR_STOP=1 -U $user -d $database -c ($sql -replace '"', '\"')
    exit $LASTEXITCODE
  } -ArgumentList $container, $dbUser, $cleanDatabase, $secondRaceSql
  Wait-Job $first, $second | Out-Null
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $firstOutput = Receive-Job $first 2>&1 | Out-String
    $secondOutput = Receive-Job $second 2>&1 | Out-String
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $raceSql = 'SELECT count(*) FROM "organization_invitations" WHERE "normalizedEmail" = ''race@example.test'';'
  $raceCount = & docker exec $container psql -v ON_ERROR_STOP=1 -U $dbUser -d $cleanDatabase -Atc ($raceSql -replace '"', '\"')
  if ($first.State -ne 'Completed' -or $raceCount -ne '1' -or $secondOutput -notmatch 'duplicate key') {
    throw 'Concurrent pending-invitation inserts did not produce one success and one unique violation'
  }
  Remove-Job $first, $second -Force

  # Incremental migration: prior history plus synthetic compatible legacy rows.
  New-DisposableDatabase $legacyDatabase
  Apply-PriorMigrations $legacyDatabase
  Invoke-Psql $legacyDatabase @'
INSERT INTO "organizations" ("id", "slug", "legalName", "displayName", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'legacy-certification', 'Legacy Certification', 'Legacy Certification', CURRENT_TIMESTAMP);
INSERT INTO "organization_invitations" ("id", "organizationId", "email", "role", "tokenDigest", "expiresAt", "acceptedAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', ' Legacy@Example.test ', 'PSYCHOLOGIST', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
'@
  if ((Invoke-Prisma $legacyDatabase @('migrate', 'deploy')) -ne 0) { throw 'Incremental migration deployment failed' }
  $normalizedSql = 'SELECT "normalizedEmail" FROM "organization_invitations" WHERE "id" = ''00000000-0000-0000-0000-000000000301'';'
  $normalized = & docker exec $container psql -v ON_ERROR_STOP=1 -U $dbUser -d $legacyDatabase -Atc ($normalizedSql -replace '"', '\"')
  if ($normalized -ne 'legacy@example.test') { throw 'Incremental migration did not preserve the defined normalized email' }

  # Invalid legacy data fails closed rather than inventing a recipient key.
  New-DisposableDatabase $invalidDatabase
  Apply-PriorMigrations $invalidDatabase
  Invoke-Psql $invalidDatabase @'
INSERT INTO "organizations" ("id", "slug", "legalName", "displayName", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'invalid-certification', 'Invalid Certification', 'Invalid Certification', CURRENT_TIMESTAMP);
INSERT INTO "organization_invitations" ("id", "organizationId", "email", "role", "tokenDigest", "expiresAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '   ', 'PSYCHOLOGIST', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP);
'@
  if ((Invoke-Prisma $invalidDatabase @('migrate', 'deploy')) -eq 0) { throw 'Unsafe legacy normalized email unexpectedly migrated' }

  # Technical rollback rehearsal: recreate a disposable database from template0
  # and apply only the prior migration chain. Prisma histories are left intact.
  New-DisposableDatabase $rollbackDatabase
  Apply-PriorMigrations $rollbackDatabase
  $column = & docker exec $container psql -v ON_ERROR_STOP=1 -U $dbUser -d $rollbackDatabase -Atc "SELECT count(*) FROM information_schema.columns WHERE table_name = 'organization_invitations' AND column_name = 'normalizedEmail';"
  if ($column -ne '0') { throw 'Rollback rehearsal did not recreate the pre-2.1C1 schema' }

  Write-Output 'Invitation lifecycle migration certification passed on disposable PostgreSQL 16 databases.'
} finally {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    & docker rm -f $container *> $null
  }
}

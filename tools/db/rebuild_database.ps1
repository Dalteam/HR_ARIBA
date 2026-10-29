#requires -Version 5
<#
  Rebuilds the staging database from the public-only filtered Supabase dump and runs the full
  normalization pipeline against it. Nothing here touches production: every step is a local,
  disposable database that can be dropped and rebuilt with this one command.

  Pipeline (same order as docs/DATABASE.md documents):
    1. reload      drop + create the database, load the filtered dump
    2. preflight   preflight_checks.sql    (report of what is dirty in the source)
    3. fixes       pre_migration_fixes.sql (repairs the dirty rows, backs them up to ops.*)
    4. preflight2  preflight_checks.sql    (must come back clean)
    5. normalize   ariba_normalization.sql (one shot: old shape -> normalized schema)
    6. migrate     001_react_port.sql + verify_001.sql
    7. report      table inventory + row counts, appended to the log

  Usage:
    powershell -NoProfile -File tools\db\rebuild_database.ps1 -Log ..\_rebuild.log
    powershell -NoProfile -File tools\db\rebuild_database.ps1 -Db ariba_src -From fixes

  -From skips the earlier steps (useful while iterating on one SQL file); only use it when the
  database already holds the state the earlier steps would have produced.
#>
param(
  [string] $Dump   = '',
  [string] $Db     = 'ariba_src',
  [string] $PgBin  = 'C:\Program Files\PostgreSQL\17\bin',
  [string] $PgUser = 'postgres',
  [string] $PgHost = 'localhost',
  [int]    $PgPort = 5432,
  [string] $Log    = '',
  [ValidateSet('reload', 'preflight', 'fixes', 'normalize', 'migrate')]
  [string] $From   = 'reload'
)

$ErrorActionPreference = 'Continue'   # NOT 'Stop': psql writes NOTICEs to stderr and PowerShell
                                      # turns those into terminating NativeCommandErrors. Failures
                                      # are detected from psql's exit code / explicit throw below.
$repo    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dump    = if ($Dump) { $Dump } else { Join-Path $repo 'supabase_public.sql' }
$logPath = if ($Log)  { $Log }  else { Join-Path $repo '_rebuild.log' }
$psql     = Join-Path $PgBin 'psql.exe'
$createdb = Join-Path $PgBin 'createdb.exe'
$dropdb   = Join-Path $PgBin 'dropdb.exe'
$norm     = Join-Path $repo 'docs\db-normalization'
$mig      = Join-Path $repo 'docs\db-migrations'

foreach ($p in @($psql, $norm, $mig)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "missing required path: $p" }
}

$env:PGPASSWORD = ''
$steps = @('reload', 'preflight', 'fixes', 'preflight2', 'normalize', 'migrate', 'report')
$start = $steps.IndexOf($From)

function Write-Log([string] $text) {
  $text | Out-File -LiteralPath $logPath -Append -Encoding utf8
}

function Invoke-Sql {
  param([string] $Label, [string] $File)
  Write-Log ''
  Write-Log ("=== {0} :: {1}" -f $Label, (Split-Path -Leaf $File))
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $out = & $psql -X -q -v ON_ERROR_STOP=1 -U $PgUser -h $PgHost -p $PgPort -d $Db -P pager=off -f $File 2>&1
  $code = $LASTEXITCODE
  $sw.Stop()
  ($out | Out-String).Trim() | Out-File -LiteralPath $logPath -Append -Encoding utf8
  Write-Log ("--- exit={0}  {1:n1}s" -f $code, $sw.Elapsed.TotalSeconds)
  if ($code -ne 0) { throw "$Label failed (exit $code): $File" }
}

function Invoke-Query {
  param([string] $Label, [string] $Sql)
  Write-Log ''
  Write-Log ("--- {0}" -f $Label)
  (& $psql -X -q -U $PgUser -h $PgHost -p $PgPort -d $Db -P pager=off -c $Sql 2>&1 |
    Out-String).Trim() | Out-File -LiteralPath $logPath -Append -Encoding utf8
}

Write-Log ''
Write-Log ("##### rebuild {0:yyyy-MM-dd HH:mm:ss}  db={1}  from={2}" -f (Get-Date), $Db, $From)

try {

if ($start -le $steps.IndexOf('reload')) {
  if (-not (Test-Path -LiteralPath $dump)) { throw "dump not found: $dump" }
  Write-Log ("=== reload :: {0} ({1:n1} MB)" -f (Split-Path -Leaf $dump), ((Get-Item -LiteralPath $dump).Length / 1MB))
  & $dropdb   -U $PgUser -h $PgHost -p $PgPort --if-exists $Db 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
  & $createdb -U $PgUser -h $PgHost -p $PgPort $Db              2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
  $sw  = [Diagnostics.Stopwatch]::StartNew()
  $out = & $psql -X -q -v ON_ERROR_STOP=1 -U $PgUser -h $PgHost -p $PgPort -d $Db -P pager=off -f $dump 2>&1
  $code = $LASTEXITCODE
  $sw.Stop()
  ($out | Out-String).Trim() | Out-File -LiteralPath $logPath -Append -Encoding utf8
  Write-Log ("--- exit={0}  {1:n1}s" -f $code, $sw.Elapsed.TotalSeconds)
  if ($code -ne 0) { throw "dump load failed (exit $code)" }
}

if ($start -le $steps.IndexOf('preflight'))  { Invoke-Sql 'preflight'  (Join-Path $norm 'preflight_checks.sql') }
if ($start -le $steps.IndexOf('fixes'))      { Invoke-Sql 'fixes'      (Join-Path $norm 'pre_migration_fixes.sql') }
if ($start -le $steps.IndexOf('preflight2')) { Invoke-Sql 'preflight2' (Join-Path $norm 'preflight_checks.sql') }
if ($start -le $steps.IndexOf('normalize'))  { Invoke-Sql 'normalize'  (Join-Path $norm 'ariba_normalization.sql') }
if ($start -le $steps.IndexOf('migrate')) {
  Invoke-Sql 'migrate'   (Join-Path $mig '001_react_port.sql')
  Invoke-Sql 'verify001' (Join-Path $mig 'verify_001.sql')
}

if ($start -le $steps.IndexOf('report')) {
  Invoke-Query 'tables and views' @'
SELECT n.nspname AS schema, c.relname AS name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view'
                      WHEN 'm' THEN 'matview' WHEN 'p' THEN 'partitioned' END AS kind
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','ops') AND c.relkind IN ('r','v','m','p')
ORDER BY 1, 2;
'@
  Invoke-Query 'row counts' @'
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.table_name) INTO n;
    RAISE NOTICE 'public.% = %', r.table_name, n;
  END LOOP;
END $$;
'@
  Invoke-Query 'unvalidated constraints' @'
SELECT conrelid::regclass AS tbl, conname, contype, convalidated
FROM pg_constraint WHERE NOT convalidated ORDER BY 1, 2;
'@
  Invoke-Query 'detached accounts (ops)' 'SELECT * FROM ops.detached_accounts ORDER BY detached_at;'
}

Write-Log ''
Write-Log '##### done'

} catch {
  Write-Log ''
  Write-Log ("##### FATAL: {0}" -f $_.Exception.Message)
  Write-Log ("##### at: {0}" -f $_.InvocationInfo.PositionMessage)
  exit 1
}

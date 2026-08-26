$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectRoot 'dist\src\http-server.js'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodePath = $nodeCommand.Source
} else {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $bundledNode)) {
        throw 'Node.js 20+ was not found in PATH or the Codex bundled runtime.'
    }
    $nodePath = $bundledNode
}

if (-not $env:MCP_HTTP_BEARER_TOKEN -or $env:MCP_HTTP_BEARER_TOKEN.Length -lt 32) {
    throw 'MCP_HTTP_BEARER_TOKEN must be set to at least 32 random characters.'
}
if (-not (Test-Path -LiteralPath $serverPath)) {
    throw "Built HTTP MCP server not found: $serverPath. Run pnpm build first."
}

& $nodePath $serverPath
exit $LASTEXITCODE

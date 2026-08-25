$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectRoot 'dist\src\server.js'

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

if (-not (Test-Path -LiteralPath $serverPath)) {
    throw "Built MCP server not found: $serverPath. Run pnpm build first."
}

& $nodePath $serverPath
exit $LASTEXITCODE

param([string]$Profile = 'feishu-doc-http')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localBinary = Join-Path $projectRoot '.local\tunnel-client\tunnel-client.exe'
$tunnelCommand = Get-Command tunnel-client -ErrorAction SilentlyContinue
if ($tunnelCommand) {
    $tunnelClient = $tunnelCommand.Source
} elseif (Test-Path -LiteralPath $localBinary) {
    $tunnelClient = $localBinary
} else {
    throw 'Official OpenAI tunnel-client was not found.'
}

if (-not $env:CONTROL_PLANE_API_KEY) {
    throw 'CONTROL_PLANE_API_KEY is required.'
}
if (-not $env:MCP_HTTP_AUTHORIZATION -or -not $env:MCP_HTTP_AUTHORIZATION.StartsWith('Bearer ')) {
    throw 'MCP_HTTP_AUTHORIZATION must contain Bearer followed by the local MCP token.'
}

$env:MCP_EXTRA_HEADERS = 'Authorization: env:MCP_HTTP_AUTHORIZATION'
$env:MCP_DISCOVERY_EXTRA_HEADERS = 'Authorization: env:MCP_HTTP_AUTHORIZATION'
& $tunnelClient run --profile $Profile
exit $LASTEXITCODE

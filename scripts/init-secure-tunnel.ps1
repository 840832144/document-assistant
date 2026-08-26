param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^tunnel_[A-Za-z0-9_-]+$')]
    [string]$TunnelId,
    [string]$Profile = 'feishu-doc-http',
    [string]$McpServerUrl = 'http://127.0.0.1:8787/mcp'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localBinary = Join-Path $projectRoot '.local\tunnel-client\tunnel-client.exe'
$tunnelCommand = Get-Command tunnel-client -ErrorAction SilentlyContinue
if ($tunnelCommand) {
    $tunnelClient = $tunnelCommand.Source
} elseif (Test-Path -LiteralPath $localBinary) {
    $tunnelClient = $localBinary
} else {
    throw 'Official OpenAI tunnel-client was not found. Download it from https://github.com/openai/tunnel-client/releases.'
}

if (-not $env:CONTROL_PLANE_API_KEY) {
    throw 'CONTROL_PLANE_API_KEY is required. Create a dedicated runtime key in OpenAI Platform tunnel settings.'
}
if (-not $env:MCP_HTTP_AUTHORIZATION -or -not $env:MCP_HTTP_AUTHORIZATION.StartsWith('Bearer ')) {
    throw 'MCP_HTTP_AUTHORIZATION must contain Bearer followed by the local MCP token.'
}

& $tunnelClient init --sample sample_mcp_remote_no_auth --profile $Profile --tunnel-id $TunnelId --mcp-server-url $McpServerUrl
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$env:MCP_EXTRA_HEADERS = 'Authorization: env:MCP_HTTP_AUTHORIZATION'
$env:MCP_DISCOVERY_EXTRA_HEADERS = 'Authorization: env:MCP_HTTP_AUTHORIZATION'
& $tunnelClient doctor --profile $Profile --explain
exit $LASTEXITCODE

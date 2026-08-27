import { randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startHttpServer, type RunningHttpServer } from '../src/http-server.js';

const selfHosted = process.argv.includes('--self-hosted');
const bearerToken = process.env.MCP_HTTP_BEARER_TOKEN?.trim() || (selfHosted ? randomBytes(32).toString('hex') : '');
if (!bearerToken) throw new Error('MCP_HTTP_BEARER_TOKEN is required for the HTTP smoke test.');

let runningServer: RunningHttpServer | undefined;
if (selfHosted) {
  runningServer = await startHttpServer({
    host: '127.0.0.1',
    port: process.argv.includes('--ephemeral') ? 0 : 8787,
    bearerToken,
  });
}
const endpoint =
  process.env.MCP_HTTP_URL?.trim() ||
  (runningServer
    ? `http://${runningServer.host}:${runningServer.port}${runningServer.endpoint}`
    : 'http://127.0.0.1:8787/mcp');

const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  authProvider: { token: async () => bearerToken },
});
const client = new Client({ name: 'feishu-doc-mcp-http-smoke', version: '0.5.0' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const health = await client.callTool({ name: 'feishu_healthcheck', arguments: {} });
  const healthOk =
    !health.isError &&
    typeof health.structuredContent === 'object' &&
    health.structuredContent !== null &&
    (health.structuredContent as Record<string, unknown>).ok === true;
  process.stdout.write(`${JSON.stringify({ endpoint, tools: tools.tools.map((tool) => tool.name), health_ok: healthOk }, null, 2)}\n`);
  if (!healthOk) process.exitCode = 2;
} finally {
  await client.close();
  await runningServer?.close();
}

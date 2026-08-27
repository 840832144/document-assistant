import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../src/config.js';
import { startHttpServer, type RunningHttpServer } from '../src/http-server.js';
import { READ_TOOL_NAMES, WRITE_TOOL_NAMES } from '../src/tools/tool-policy.js';

const EXPECTED_TOOLS = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].sort();
const runningHttpServers: RunningHttpServer[] = [];

afterEach(async () => {
  await Promise.all(runningHttpServers.splice(0).map((server) => server.close()));
});

describe('MCP transports', () => {
  it('keeps the STDIO transport and exposes every tool with explicit access annotations', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(PROJECT_ROOT, 'src', 'server.ts')],
      env: {},
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-regression-test', version: '0.5.0' });

    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOLS);
      for (const tool of listed.tools) {
        expect(tool.annotations?.readOnlyHint).toBe(READ_TOOL_NAMES.includes(tool.name as never));
      }
    } finally {
      await client.close();
    }
  });

  it('serves Streamable HTTP only with the configured bearer token', async () => {
    const bearerToken = randomBytes(32).toString('hex');
    const server = await startHttpServer({ host: '127.0.0.1', port: 0, bearerToken });
    runningHttpServers.push(server);
    const url = new URL(`http://${server.host}:${server.port}${server.endpoint}`);

    const unauthorized = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('www-authenticate')).toContain('Bearer');

    const transport = new StreamableHTTPClientTransport(url, {
      authProvider: { token: async () => bearerToken },
    });
    const client = new Client({ name: 'http-regression-test', version: '0.5.0' });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOLS);
    } finally {
      await client.close();
    }
  });

  it('refuses to start HTTP without a strong bearer token', async () => {
    await expect(startHttpServer({ port: 0, bearerToken: '' })).rejects.toThrow('MCP_HTTP_BEARER_TOKEN');
  });
});

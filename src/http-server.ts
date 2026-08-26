#!/usr/bin/env node
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer as createNodeServer, type Server as NodeServer } from 'node:http';
import {
  createMcpHandler,
  hostHeaderValidationResponse,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { Services } from './services.js';
import { createServer } from './server.js';

export interface HttpServerOptions {
  host?: string;
  port?: number;
  endpoint?: string;
  bearerToken?: string;
}

export interface RunningHttpServer {
  server: NodeServer;
  host: string;
  port: number;
  endpoint: string;
  close(): Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_ENDPOINT = '/mcp';
const MIN_TOKEN_LENGTH = 32;

export async function startHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? process.env.MCP_HTTP_HOST?.trim() ?? DEFAULT_HOST;
  const port = options.port ?? parsePort(process.env.MCP_HTTP_PORT);
  const endpoint = normalizeEndpoint(options.endpoint ?? process.env.MCP_HTTP_ENDPOINT ?? DEFAULT_ENDPOINT);
  const bearerToken = options.bearerToken ?? process.env.MCP_HTTP_BEARER_TOKEN?.trim() ?? '';
  validateBearerToken(bearerToken);

  const services = new Services();
  const mcpHandler = createMcpHandler(() => createServer(services), {
    legacy: 'stateless',
    responseMode: 'auto',
    onerror: (error) => process.stderr.write(`[http-mcp] ${safeErrorMessage(error)}\n`),
  });

  const authenticatedHandler = {
    fetch: async (request: Request): Promise<Response> => {
      const hostRejection = hostHeaderValidationResponse(request, allowedHostnames(host));
      if (hostRejection) return hostRejection;
      if (!isAuthorized(request.headers.get('authorization'), bearerToken)) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
            'www-authenticate': 'Bearer realm="feishu-doc-mcp"',
          },
        });
      }
      return mcpHandler.fetch(request);
    },
  };
  const nodeMcpHandler = toNodeHandler(authenticatedHandler, {
    onerror: (error) => process.stderr.write(`[http-adapter] ${safeErrorMessage(error)}\n`),
  });

  const server = createNodeServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
      if (url.pathname === '/healthz' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: true, transport: 'streamable-http' }));
        return;
      }
      if (url.pathname !== endpoint) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      await nodeMcpHandler(
        request as Parameters<typeof nodeMcpHandler>[0],
        response as Parameters<typeof nodeMcpHandler>[1],
      );
    } catch (error) {
      process.stderr.write(`[http-server] ${safeErrorMessage(error)}\n`);
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'internal_server_error' }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    server,
    host,
    port: actualPort,
    endpoint,
    async close() {
      await mcpHandler.close();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

function parsePort(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_PORT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error('MCP_HTTP_PORT must be an integer between 1 and 65535.');
  }
  return parsed;
}

function normalizeEndpoint(value: string): string {
  const endpoint = value.trim();
  if (!endpoint.startsWith('/') || endpoint.includes('?') || endpoint.includes('#')) {
    throw new Error('MCP_HTTP_ENDPOINT must be an absolute URL path such as /mcp.');
  }
  return endpoint;
}

function validateBearerToken(token: string): void {
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`MCP_HTTP_BEARER_TOKEN is required and must contain at least ${MIN_TOKEN_LENGTH} characters.`);
  }
}

function isAuthorized(header: string | null, expectedToken: string): boolean {
  const prefix = 'Bearer ';
  if (!header?.startsWith(prefix)) return false;
  const suppliedDigest = createHash('sha256').update(header.slice(prefix.length)).digest();
  const expectedDigest = createHash('sha256').update(expectedToken).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

function allowedHostnames(host: string): string[] {
  return [...new Set([host, 'localhost', '127.0.0.1', '[::1]'])];
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]') : 'Unknown error';
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  startHttpServer()
    .then(({ host, port, endpoint }) => {
      process.stderr.write(`[http-mcp] listening on http://${host}:${port}${endpoint}\n`);
    })
    .catch((error) => {
      process.stderr.write(`[http-mcp] startup failed: ${safeErrorMessage(error)}\n`);
      process.exitCode = 1;
    });
}

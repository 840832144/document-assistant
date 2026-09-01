import type { McpServer } from '@modelcontextprotocol/server';
import { getConfigStatus } from '../config.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';
import { READ_TOOL_ANNOTATIONS } from './tool-policy.js';

export function registerHealthcheckTool(server: McpServer, services: Services): void {
  server.registerTool(
    'feishu_healthcheck',
    {
      description: 'Safely verify Feishu environment variables, tenant token acquisition, API connectivity, and Drive permission.',
      inputSchema: {},
      annotations: READ_TOOL_ANNOTATIONS,
    },
    async () => {
      const status = getConfigStatus();
      const checks: Record<string, unknown> = {
        environment: {
          FEISHU_APP_ID: status.appIdPresent ? 'present' : 'missing',
          FEISHU_APP_SECRET: status.appSecretPresent ? 'present' : 'missing',
        },
        api_base: status.apiBase,
        registry_path: status.registryPath,
      };
      if (!status.appIdPresent || !status.appSecretPresent) {
        return okResult({ ok: false, checks, next_action: 'Set both variables in the parent process environment and restart Codex.' });
      }
      try {
        const client = services.getClient();
        await client.auth.getToken();
        checks.token = 'ok';
        await client.request('GET', 'drive/v1/files', { query: { page_size: 1 } });
        checks.api_connectivity = 'ok';
        checks.permission_probe = { status: 'ok', scope: 'drive:drive' };
        return okResult({
          ok: true,
          checks,
          required_document_scopes: ['docx:document:create', 'docx:document:write_only', 'docx:document:readonly'],
          optional_bitable_scopes: ['bitable:app', 'bitable:app:readonly'],
        });
      } catch (error) {
        const safe = errorResult(error);
        return {
          ...safe,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: false, checks, diagnosis: safe.structuredContent }, null, 2),
            },
          ],
        };
      }
    },
  );
}

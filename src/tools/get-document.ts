import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { parseDocumentId } from '../feishu/docs.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';

export function registerGetDocumentTool(server: McpServer, services: Services): void {
  server.registerTool(
    'get_document',
    {
      description: 'Get a Feishu document by document_id or URL, including title, plain text, and simplified block structure.',
      inputSchema: z.object({ document_id: z.string().min(1).optional(), url: z.string().url().optional() }).refine(
        (value) => Boolean(value.document_id || value.url),
        'Provide document_id or url',
      ),
      annotations: { readOnlyHint: true },
    },
    async ({ document_id, url }) => {
      try {
        const id = parseDocumentId(document_id ?? url ?? '');
        const existing = await services.registry.get(id);
        const document = await services.getDocs().getDocument(id);
        if (existing?.url) document.url = existing.url;
        await services.registry.upsert({
          document_id: id,
          title: document.title,
          url: document.url,
          ...(existing?.folder_token ? { folder_token: existing.folder_token } : {}),
          ...(existing?.project ? { project: existing.project } : {}),
          ...(existing?.created_at ? { created_at: existing.created_at } : {}),
        });
        return okResult(document);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

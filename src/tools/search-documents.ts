import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';

export function registerSearchDocumentsTool(server: McpServer, services: Services): void {
  server.registerTool(
    'search_documents',
    {
      description: 'Search locally registered documents by partial title, project, or exact document_id.',
      inputSchema: z.object({
        title: z.string().optional(),
        project: z.string().optional(),
        document_id: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (query) => {
      try {
        return okResult({
          results: await services.registry.search({
            ...(query.title ? { title: query.title } : {}),
            ...(query.project ? { project: query.project } : {}),
            ...(query.document_id ? { document_id: query.document_id } : {}),
          }),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

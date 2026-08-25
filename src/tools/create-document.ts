import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { markdownToFeishu } from '../converters/markdown-to-feishu.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';

export function registerCreateDocumentTool(server: McpServer, services: Services): void {
  server.registerTool(
    'create_document',
    {
      description: 'Create a Feishu cloud document from Markdown, optionally inside a folder, and record it in the local registry.',
      inputSchema: z.object({
        title: z.string().min(1).max(800),
        markdown: z.string(),
        folder_token: z.string().min(1).optional(),
        project: z.string().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, markdown, folder_token, project }) => {
      try {
        const converted = markdownToFeishu(markdown);
        const created = await services.getDocs().createDocument(title, converted, folder_token);
        await services.registry.upsert({
          ...created,
          ...(folder_token ? { folder_token } : {}),
          ...(project ? { project } : {}),
        });
        return okResult({ ...created, conversion_warnings: converted.warnings });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

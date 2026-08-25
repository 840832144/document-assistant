import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { markdownToFeishu } from '../converters/markdown-to-feishu.js';
import { parseDocumentId } from '../feishu/docs.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';

const updateInput = z.object({
  document_id: z.string().min(1),
  markdown: z.string(),
});

export function registerUpdateDocumentTools(server: McpServer, services: Services): void {
  server.registerTool(
    'append_document',
    {
      description: 'Append converted Markdown to the end of an existing Feishu document.',
      inputSchema: updateInput,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ document_id, markdown }) => {
      try {
        const id = parseDocumentId(document_id);
        const converted = markdownToFeishu(markdown);
        await services.getDocs().appendDocument(id, converted);
        await updateRegistryAfterWrite(services, id);
        return okResult({ document_id: id, appended: true, conversion_warnings: converted.warnings });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'replace_document',
    {
      description: 'Replace a document body after snapshotting and deleting old root blocks; attempts rollback if the new write fails.',
      inputSchema: updateInput,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ document_id, markdown }) => {
      try {
        const id = parseDocumentId(document_id);
        const converted = markdownToFeishu(markdown);
        await services.getDocs().replaceDocument(id, converted);
        await updateRegistryAfterWrite(services, id);
        return okResult({ document_id: id, replaced: true, conversion_warnings: converted.warnings });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

async function updateRegistryAfterWrite(services: Services, documentId: string): Promise<void> {
  if (await services.registry.touch(documentId)) return;
  const doc = await services.getDocs().getDocument(documentId);
  await services.registry.upsert({ document_id: documentId, title: doc.title, url: doc.url });
}

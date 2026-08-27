import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { parseDocumentId } from '../feishu/docs.js';
import { DOCUMENTATION_CATEGORIES, DOCUMENTATION_STATUSES } from '../registry.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';
import { WRITE_TOOL_ANNOTATIONS } from './tool-policy.js';

export function registerDocumentationHubTool(server: McpServer, services: Services): void {
  server.registerTool(
    'register_document',
    {
      description:
        'Register an existing formal Feishu document in the unique AI Workspace 文档导航中心, rebuild the generated index, and verify navigation-center readback. Do not use for temporary test documents.',
      inputSchema: z.object({
        document_id: z.string().min(1).describe('Feishu document ID or docx URL'),
        description: z.string().min(1).max(300).describe('One-sentence planner-facing description'),
        category: z.enum(DOCUMENTATION_CATEGORIES),
        status: z.enum(DOCUMENTATION_STATUSES),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ document_id, description, category, status }) => {
      try {
        return okResult(
          await services.getDocumentationHub().registerDocument({
            documentId: parseDocumentId(document_id),
            description,
            category,
            status,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

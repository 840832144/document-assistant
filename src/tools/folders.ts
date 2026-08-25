import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';

export function registerFolderTools(server: McpServer, services: Services): void {
  server.registerTool(
    'create_folder',
    {
      description: 'Create a folder in Feishu Drive.',
      inputSchema: z.object({
        name: z.string().min(1).max(255),
        parent_folder_token: z.string().min(1).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ name, parent_folder_token }) => {
      try {
        return okResult(await services.getDrive().createFolder(name, parent_folder_token));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_folder',
    {
      description: 'List files and folders in a Feishu Drive folder.',
      inputSchema: z.object({ folder_token: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ folder_token }) => {
      try {
        return okResult({ folder_token, items: await services.getDrive().listFolder(folder_token) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

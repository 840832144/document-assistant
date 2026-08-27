import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { parseDocumentId } from '../feishu/docs.js';
import type { PermissionMemberType } from '../feishu/drive.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';
import { WRITE_TOOL_ANNOTATIONS } from './tool-policy.js';

const documentInput = z.object({
  document_id: z.string().min(1).describe('Feishu document ID or docx URL'),
});

const userMemberTypes = ['email', 'openid', 'unionid', 'userid'] as const;

export function registerPermissionTools(server: McpServer, services: Services): void {
  server.registerTool(
    'grant_company_view',
    {
      description:
        'Allow everyone in the current Feishu tenant who has the link to view a document. Enterprise sharing policy may reject this.',
      inputSchema: documentInput,
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ document_id }) => {
      try {
        const id = parseDocumentId(document_id);
        return okResult(await services.getDrive().grantCompanyView(id));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'grant_company_edit',
    {
      description:
        'Allow everyone in the current Feishu tenant who has the link to edit a document. Enterprise sharing policy may reject this.',
      inputSchema: documentInput,
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ document_id }) => {
      try {
        const id = parseDocumentId(document_id);
        return okResult(await services.getDrive().grantCompanyEdit(id));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'grant_group_edit',
    {
      description: 'Grant edit permission on a Feishu document to a specific Feishu group by open chat ID.',
      inputSchema: documentInput.extend({
        chat_id: z.string().min(1).describe('Feishu open chat ID, normally beginning with oc_'),
        need_notification: z.boolean().default(false),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ document_id, chat_id, need_notification }) => {
      try {
        const id = parseDocumentId(document_id);
        return okResult(await services.getDrive().grantMemberEdit(id, 'openchat', chat_id, need_notification));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'grant_user',
    {
      description: 'Grant edit permission on a Feishu document to a specific user by email, open ID, union ID, or user ID.',
      inputSchema: documentInput.extend({
        member_id: z.string().min(1),
        member_type: z.enum(userMemberTypes).default('openid'),
        need_notification: z.boolean().default(false),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ document_id, member_id, member_type, need_notification }) => {
      try {
        const id = parseDocumentId(document_id);
        return okResult(
          await services
            .getDrive()
            .grantMemberEdit(id, member_type as PermissionMemberType, member_id, need_notification),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { markdownToFeishu } from '../converters/markdown-to-feishu.js';
import { safeError } from '../feishu/errors.js';
import type { PermissionMemberType } from '../feishu/drive.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';
import { WRITE_TOOL_ANNOTATIONS } from './tool-policy.js';

const sharingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('company_editable') }),
  z.object({
    mode: z.literal('group_editable'),
    chat_id: z.string().min(1).describe('Feishu open chat ID, normally beginning with oc_'),
    need_notification: z.boolean().default(false),
  }),
  z.object({
    mode: z.literal('user_editable'),
    member_id: z.string().min(1),
    member_type: z.enum(['email', 'openid', 'unionid', 'userid']).default('openid'),
    need_notification: z.boolean().default(false),
  }),
  z.object({ mode: z.literal('private') }),
]);

export type DocumentSharing = z.infer<typeof sharingSchema>;

export function registerCreateDocumentTool(server: McpServer, services: Services): void {
  server.registerTool(
    'create_document',
    {
      description:
        'Create a Feishu cloud document from Markdown and immediately apply sharing. Defaults to company_editable; use sharing.mode=private to opt out.',
      inputSchema: z.object({
        title: z.string().min(1).max(800),
        markdown: z.string(),
        folder_token: z.string().min(1).optional(),
        project: z.string().min(1).max(200).optional(),
        sharing: sharingSchema.optional().describe('Post-create sharing policy; defaults to company_editable'),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ title, markdown, folder_token, project, sharing }) => {
      try {
        const converted = markdownToFeishu(markdown);
        const created = await services.getDocs().createDocument(title, converted, folder_token);
        await services.registry.upsert({
          ...created,
          ...(folder_token ? { folder_token } : {}),
          ...(project ? { project } : {}),
        });
        const permission = await applyDocumentSharing(services, created.document_id, sharing);
        return okResult({ ...created, permission, conversion_warnings: converted.warnings });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

export async function applyDocumentSharing(
  services: Services,
  documentId: string,
  sharing: DocumentSharing | undefined,
): Promise<Record<string, unknown>> {
  const policy: DocumentSharing = sharing ?? { mode: 'company_editable' };
  if (policy.mode === 'private') return { status: 'skipped', mode: 'private' };

  try {
    if (policy.mode === 'company_editable') {
      return { status: 'applied', mode: policy.mode, ...(await services.getDrive().grantCompanyEdit(documentId)) };
    }
    if (policy.mode === 'group_editable') {
      return {
        status: 'applied',
        mode: policy.mode,
        ...(await services.getDrive().grantMemberEdit(documentId, 'openchat', policy.chat_id, policy.need_notification)),
      };
    }
    return {
      status: 'applied',
      mode: policy.mode,
      ...(await services
        .getDrive()
        .grantMemberEdit(
          documentId,
          policy.member_type as PermissionMemberType,
          policy.member_id,
          policy.need_notification,
        )),
    };
  } catch (error) {
    return {
      status: 'failed',
      mode: policy.mode,
      document_created: true,
      error: safeError(error),
      next_action:
        'Do not retry create_document. Use a grant_* tool after checking the app permission and the enterprise admin sharing policy.',
    };
  }
}

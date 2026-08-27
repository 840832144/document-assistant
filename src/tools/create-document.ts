import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { markdownToFeishu } from '../converters/markdown-to-feishu.js';
import { safeError } from '../feishu/errors.js';
import type { PermissionMemberType } from '../feishu/drive.js';
import { DOCUMENTATION_CATEGORIES, DOCUMENTATION_STATUSES } from '../registry.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';
import { WRITE_TOOL_ANNOTATIONS } from './tool-policy.js';

const sharingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('company_readable') }),
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

const documentationSchema = z.object({
  category: z.enum(DOCUMENTATION_CATEGORIES).default('📦 Archive'),
  description: z
    .string()
    .min(1)
    .max(300)
    .default('由 AI Document Assistant 创建的正式云文档。'),
  status: z.enum(DOCUMENTATION_STATUSES).default('Draft'),
});

const createDocumentSchema = z.object({
  title: z.string().min(1).max(800),
  markdown: z.string(),
  folder_token: z.string().min(1).optional(),
  project: z.string().min(1).max(200).optional(),
  sharing: sharingSchema.optional().describe('Post-create sharing policy; defaults to company_editable'),
  document_kind: z
    .enum(['formal', 'temporary'])
    .default('formal')
    .describe('Formal documents must be registered in AI Workspace 文档导航中心; temporary is only for disposable tests.'),
  documentation: documentationSchema.optional().describe('文档导航中心 metadata for a formal document.'),
});

export type DocumentSharing = z.infer<typeof sharingSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export function registerCreateDocumentTool(server: McpServer, services: Services): void {
  server.registerTool(
    'create_document',
    {
      description:
        'Create a Feishu cloud document, apply sharing, read it back, and automatically register every formal document in the unique AI Workspace 文档导航中心. Defaults to formal and company_editable; temporary is only for disposable validation documents.',
      inputSchema: createDocumentSchema,
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async (input) => createDocumentWithGovernance(services, input),
  );
}

export async function createDocumentWithGovernance(services: Services, input: CreateDocumentInput) {
  const { title, markdown, folder_token, project, sharing, document_kind, documentation } = input;
  let created: { document_id: string; title: string; url: string } | undefined;
  let stage = 'create_document';
  try {
    const converted = markdownToFeishu(markdown);
    created = await services.getDocs().createDocument(title, converted, folder_token);
    await services.registry.upsert({
      ...created,
      ...(folder_token ? { folder_token } : {}),
      ...(project ? { project } : {}),
    });
    const permission = await applyDocumentSharing(services, created.document_id, sharing);
    stage = 'document_readback';
    const readback = await services.getDocs().getDocument(created.document_id);
    let registration: Record<string, unknown> = { status: 'skipped', reason: 'temporary document' };
    if (document_kind === 'formal') {
      stage = 'documentation_hub_registration';
      const registered = await services.getDocumentationHub().registerDocument({
        documentId: created.document_id,
        category: documentation?.category ?? '📦 Archive',
        description: documentation?.description ?? '由 AI Document Assistant 创建的正式云文档。',
        status: documentation?.status ?? 'Draft',
      });
      registration = { status: 'registered', ...registered };
    }
    return okResult({
      ...created,
      permission,
      readback: { verified: true, title: readback.title },
      documentation_hub: registration,
      conversion_warnings: converted.warnings,
    });
  } catch (error) {
    if (created) return postCreateFailureResult(created, stage, error);
    return errorResult(error);
  }
}

function postCreateFailureResult(
  created: { document_id: string; title: string; url: string },
  stage: string,
  error: unknown,
) {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const value = {
    type: 'PostCreateWorkflowError',
    message: 'The document was created, but the mandatory post-create workflow did not complete.',
    stage,
    document_created: true,
    document_id: created.document_id,
    title: created.title,
    url: created.url,
    cause: safeError(error, {
      ...(appId ? { appId } : {}),
      ...(appSecret ? { appSecret } : {}),
    }),
    next_action:
      stage === 'documentation_hub_registration'
        ? 'Do not retry create_document. Repair the Hub issue, then call register_document for this existing document.'
        : 'Do not retry create_document. Read back this existing document, then complete 文档导航中心 registration.',
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

export async function applyDocumentSharing(
  services: Services,
  documentId: string,
  sharing: DocumentSharing | undefined,
): Promise<Record<string, unknown>> {
  const policy: DocumentSharing = sharing ?? { mode: 'company_editable' };
  if (policy.mode === 'private') return { status: 'skipped', mode: 'private' };

  try {
    if (policy.mode === 'company_readable') {
      return { status: 'applied', mode: policy.mode, ...(await services.getDrive().grantCompanyView(documentId)) };
    }
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

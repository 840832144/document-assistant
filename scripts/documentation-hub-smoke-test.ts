import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../src/config.js';
import { DOCUMENTATION_HUB_TITLE } from '../src/documentation-hub.js';
import { parseDocumentId } from '../src/feishu/docs.js';
import { Services } from '../src/services.js';

const forwardedEnvironment: Record<string, string> = {};
for (const name of ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_DOCUMENT_REGISTRY_PATH']) {
  const value = process.env[name];
  if (value) forwardedEnvironment[name] = value;
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(PROJECT_ROOT, 'dist', 'src', 'server.js')],
  env: forwardedEnvironment,
});
const client = new Client({ name: 'documentation-hub-smoke', version: '0.5.0' });
const title = `Documentation Hub 自动登记测试｜${new Date().toISOString()}`;
let createdId: string | undefined;
let hubUrl: string | undefined;

try {
  await client.connect(transport);
  const created = await client.callTool({
    name: 'create_document',
    arguments: {
      title,
      project: 'AI-Workspace-Documentation-Hub',
      markdown: '这是用于验证正式文档自动登记与清理恢复的临时内容。',
      document_kind: 'formal',
      documentation: {
        category: '📦 Archive',
        description: '验证正式文档创建后自动登记到唯一 Documentation Hub。',
        status: 'Draft',
      },
    },
  });
  const structured = created.structuredContent as Record<string, unknown> | undefined;
  createdId = typeof structured?.document_id === 'string' ? structured.document_id : undefined;
  const hub = structured?.documentation_hub as Record<string, unknown> | undefined;
  hubUrl = typeof hub?.hub_url === 'string' ? hub.hub_url : undefined;
  if (created.isError || !createdId || hub?.status !== 'registered' || !hubUrl) {
    throw new Error('Formal create did not complete Documentation Hub registration.');
  }

  const hubReadback = await client.callTool({ name: 'get_document', arguments: { url: hubUrl } });
  const readback = hubReadback.structuredContent as Record<string, unknown> | undefined;
  if (hubReadback.isError || readback?.title !== DOCUMENTATION_HUB_TITLE) {
    throw new Error('Documentation Hub readback failed after automatic registration.');
  }
  if (typeof readback.plain_text !== 'string' || !readback.plain_text.includes(title)) {
    throw new Error('Documentation Hub readback did not contain the automatic-registration test document.');
  }
} finally {
  await client.close();
}

if (!createdId || !hubUrl) throw new Error('Automatic-registration test did not produce a cleanup target.');

const services = new Services();
const cleanup = await services.getDocumentationHub().removeDocumentForValidatedCleanup(createdId);
const finalReadback = await services.getDocs().getDocument(parseDocumentId(hubUrl));
if (finalReadback.plain_text.includes(title)) {
  throw new Error('Documentation Hub still contains the deleted test document.');
}
const uniqueHub = await services.getDrive().findByExactName(DOCUMENTATION_HUB_TITLE);
if (uniqueHub.filter((item) => item.type === 'docx' || item.type === 'doc').length !== 1) {
  throw new Error('Documentation Hub uniqueness verification failed after cleanup.');
}

process.stdout.write(
  `${JSON.stringify(
    {
      formal_create_registered: true,
      create_readback_verified: true,
      test_document_deleted: true,
      hub_restored: true,
      hub_unique: true,
      hub_url: cleanup.hub_url,
      registered_documents: cleanup.registered_documents,
    },
    null,
    2,
  )}\n`,
);

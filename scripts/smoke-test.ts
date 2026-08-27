import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../src/config.js';

const shouldCreate = process.argv.includes('--create');
const forwardedEnvironment: Record<string, string> = {};
if (process.env.FEISHU_APP_ID) forwardedEnvironment.FEISHU_APP_ID = process.env.FEISHU_APP_ID;
if (process.env.FEISHU_APP_SECRET) forwardedEnvironment.FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(PROJECT_ROOT, 'dist', 'src', 'server.js')],
  env: forwardedEnvironment,
});
const client = new Client({ name: 'feishu-doc-mcp-smoke', version: '0.5.1' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expected = [
    'feishu_healthcheck',
    'create_document',
    'register_document',
    'append_document',
    'replace_document',
    'get_document',
    'create_folder',
    'list_folder',
    'search_documents',
    'grant_company_view',
    'grant_company_edit',
    'grant_group_edit',
    'grant_user',
  ];
  const names = tools.tools.map((tool) => tool.name);
  const missing = expected.filter((name) => !names.includes(name));
  if (missing.length > 0) throw new Error(`tools/list is missing: ${missing.join(', ')}`);
  process.stdout.write(`${JSON.stringify({ tools_list: 'ok', tools: names }, null, 2)}\n`);

  const health = await client.callTool({ name: 'feishu_healthcheck', arguments: {} });
  process.stdout.write(`${JSON.stringify({ healthcheck: health }, null, 2)}\n`);
  const healthOk =
    !health.isError &&
    typeof health.structuredContent === 'object' &&
    health.structuredContent !== null &&
    (health.structuredContent as Record<string, unknown>).ok === true;
  if (!healthOk) process.exitCode = 2;

  if (shouldCreate && healthOk) {
    const timestamp = new Date().toISOString();
    const result = await client.callTool({
      name: 'create_document',
      arguments: {
        title: 'Codex × 飞书连接测试',
        project: 'feishu-doc-mcp',
        document_kind: 'temporary',
        markdown: `# Codex × 飞书连接测试

如果你看到这篇文档，说明：

- Codex 已经连接飞书
- MCP Server 正常
- 文档 API 正常
- Markdown 转换正常

## 测试时间

${timestamp}

## 下一步

之后正式报告将可以由 Codex 直接创建和更新。`,
      },
    });
    process.stdout.write(`${JSON.stringify({ create_document: result }, null, 2)}\n`);
    if (result.isError) {
      process.exitCode = 3;
    } else {
      const structured = result.structuredContent as Record<string, unknown> | undefined;
      const permission = structured?.permission as Record<string, unknown> | undefined;
      if (permission?.status !== 'applied') process.exitCode = 4;
    }
  }
} finally {
  await client.close();
}

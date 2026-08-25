# feishu-doc-mcp

一个可长期复用的本地 STDIO MCP Server，让 Codex 通过飞书官方 OpenAPI 创建、读取和维护新版飞书云文档。

## 当前能力

- `feishu_healthcheck`：安全检查环境变量、tenant token、API 连通性和云空间权限。
- `create_document`：将 Markdown 导入为飞书原生文档块，可指定目录和项目名。
- `append_document`：在文档末尾追加 Markdown。
- `replace_document`：先读取快照和原生 blocks，再删除旧正文、写入新正文；失败时尝试回滚。
- `get_document`：按 document ID 或 URL 返回标题、纯文本和简化 block 结构。
- `create_folder` / `list_folder`：创建和浏览云空间目录。
- `search_documents`：按标题、项目或 document ID 查询本地 Registry。

图片、电子表格和 Wiki 工具已在架构中预留，但不属于第一阶段。

## 安全模型

运行时只从父进程环境读取：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
```

项目不会把凭据或 tenant token 写入源代码、日志、Registry 或 Codex 配置。token 只保存在进程内存中，并在过期前自动刷新。`.env`、`.env.local`、`*.secret`、`credentials*` 和 `data/token*` 均被 Git 忽略。

推荐在 Windows 用户环境中设置两个变量，然后完全退出并重新启动 Codex，使桌面进程继承它们。不要把真实值写入 `.env.example`。

## 飞书应用准备

认证类型为企业自建应用（App ID + App Secret → `tenant_access_token`）。在“飞书开放平台 → 应用 → 权限管理”至少启用并发布以下权限：

- `docx:document:create`
- `docx:document:write_only`
- `docx:document:readonly`
- `drive:drive`

若 API 返回权限错误，MCP 结果会包含调用的 API、HTTP 状态、飞书错误 code、建议 scope 和后台位置。权限变更后需要发布新应用版本，并确认应用已安装到目标企业。

## 安装与构建

要求 Node.js 20+。本机开发时也可使用 Codex 桌面附带的 Node.js 运行时。

```powershell
pnpm install
pnpm check
```

启动脚本 `scripts/start-server.ps1` 会优先使用 PATH 中的 Node.js；如果没有，则回退到 Codex 桌面附带的运行时。

## 注册到 Codex

当前 Codex 官方文档支持本地 STDIO MCP 和 `codex mcp add`。注册命令不包含任何凭据：

```powershell
codex mcp add feishu-docs -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\admin\Documents\Codex\feishu-doc-mcp\scripts\start-server.ps1
```

配置中应仅按名称透传变量：

```toml
env_vars = ["FEISHU_APP_ID", "FEISHU_APP_SECRET"]
```

绝不能改成 `[mcp_servers.feishu-docs.env]` 下的明文值。验证：

```powershell
codex mcp list
codex mcp get feishu-docs
```

新的 Codex 会话中先调用 `feishu_healthcheck`。本仓库还提供独立协议烟测：

```powershell
pnpm smoke:health
pnpm smoke:create
```

`smoke:create` 会创建《Codex × 飞书连接测试》，因此它是有写入副作用的命令。

## Markdown 转换

`src/converters/markdown-to-feishu.ts` 使用 GFM AST 生成独立的语义层：heading、paragraph、text run、bold、italic、link、bullet、ordered list、quote、code、divider 和 table。规范化后的 Markdown 交给飞书官方 `docs_ai/v1` OpenAPI，由飞书服务端写成原生 Docx blocks，包括原生表格；不支持的节点会被简化并返回 warning，不会让整篇文档失败。

## Registry

运行时维护 `data/document-registry.json`：

```json
{
  "document_id": "...",
  "title": "...",
  "url": "...",
  "folder_token": "...",
  "project": "...",
  "created_at": "...",
  "updated_at": "..."
}
```

该文件不含凭据，但包含私有文档元数据，因此只保存在本机并被 Git 忽略。以后遇到“更新之前那篇 Huuuge 数值体系报告”之类请求，应先调用 `search_documents`，再更新原文档。

## 目录结构

```text
src/
  server.ts
  config.ts
  registry.ts
  feishu/        # auth、HTTP client、Docs、Drive、Sheets 预留
  tools/         # MCP tools
  converters/    # Markdown 语义转换
data/            # 本地 Registry
tests/           # 单元测试
docs/            # 开发记录
scripts/         # 启动、烟测、Secret 扫描
```

## 维护约定

每次功能变更必须更新 `CHANGELOG.md` 和 `docs/DEVELOPMENT_LOG.md`，并依次运行：

```powershell
pnpm check
pnpm secret:scan
```

参考资料：

- [Codex MCP 官方文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [飞书开放平台](https://open.feishu.cn/document/)
- [Lark 官方 CLI 的文档 OpenAPI 实现](https://github.com/larksuite/cli/tree/main/shortcuts/doc)

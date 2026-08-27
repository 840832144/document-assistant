# feishu-doc-mcp

一个可长期复用的双 transport MCP Server，让 Codex 和 ChatGPT 复用同一套飞书 client、认证、Registry、Markdown converter、services 与 MCP tools：

```text
feishu-doc-mcp
├── STDIO transport           → Codex
└── Streamable HTTP transport → OpenAI Secure MCP Tunnel → ChatGPT
```

## 当前能力

- `feishu_healthcheck`：安全检查环境变量、tenant token、API 连通性和云空间权限。
- `create_document`：将 Markdown 导入为飞书原生文档块，并默认自动设为“企业内获得链接的人可编辑”。
- `append_document`：在文档末尾追加 Markdown。
- `replace_document`：先读取快照和原生 blocks，再删除旧正文、写入新正文；失败时尝试回滚。
- `get_document`：按 document ID 或 URL 返回标题、纯文本和简化 block 结构。
- `create_folder` / `list_folder`：创建和浏览云空间目录。
- `grant_company_view`：把已有文档设为企业内获得链接的人可查看，并 GET 回读确认。
- `grant_company_edit`：把已有文档设为企业内获得链接的人可编辑，并 GET 回读确认。
- `grant_group_edit`：给指定飞书群（open chat ID）添加可编辑协作者权限。
- `grant_user`：按 email、open ID、union ID 或 user ID 给指定用户添加可编辑权限。
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

HTTP transport 还强制要求独立的 `MCP_HTTP_BEARER_TOKEN`（至少 32 个字符），并使用恒定时间摘要比较。默认只绑定 `127.0.0.1`，MCP endpoint 未携带正确 Bearer token 时返回 `401`。token 不写入源码、Git、日志或 tunnel profile。

## 飞书应用准备

认证类型为企业自建应用（App ID + App Secret → `tenant_access_token`）。在“飞书开放平台 → 应用 → 权限管理”至少启用并发布以下权限：

- `docx:document:create`
- `docx:document:write_only`
- `docx:document:readonly`
- `drive:drive`

若 API 返回权限错误，MCP 结果会包含调用的 API、HTTP 状态、飞书错误 code、建议 scope 和后台位置。权限变更后需要发布新应用版本，并确认应用已安装到目标企业。

## 自动文档权限

`create_document` 创建和写入 Registry 后会立即应用 Drive Permission API。省略 `sharing` 时默认：

```json
{
  "mode": "company_editable"
}
```

对应 `PATCH /drive/v2/permissions/{document_id}/public?type=docx`，只更新 `link_share_entity` 为 `tenant_editable`，随后 GET 同一接口确认结果。也可以逐次覆盖：

```json
{ "mode": "company_readable" }
```

`company_readable` 使用同一 API 写入并回读 `tenant_readable`，适用于由 Git 或其他系统维护、只需企业内链接查看的发布文档。

```json
{ "mode": "group_editable", "chat_id": "oc_xxx", "need_notification": false }
```

```json
{ "mode": "user_editable", "member_type": "openid", "member_id": "ou_xxx", "need_notification": false }
```

```json
{ "mode": "private" }
```

群和用户授权使用 `POST /drive/v1/permissions/{document_id}/members?type=docx`，固定授予 `edit`，不授予管理权限。已有文档可以直接调用 `grant_company_view`、`grant_company_edit`、`grant_group_edit` 或 `grant_user`。

权限修改不能绕过企业管理员策略。如果管理员禁止企业链接编辑，文档仍会创建成功，返回值中 `permission.status` 为 `failed`、`document_created` 为 `true`。此时不要重试 `create_document`，否则会产生重复文档；管理员放开策略后调用对应 `grant_*` 工具即可。

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

## 启动 Streamable HTTP

先生成一次随机 token，并保存到当前 Windows 用户环境；命令不会打印 token：

```powershell
$token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
[Environment]::SetEnvironmentVariable('MCP_HTTP_BEARER_TOKEN', $token, 'User')
[Environment]::SetEnvironmentVariable('MCP_HTTP_AUTHORIZATION', "Bearer $token", 'User')
Remove-Variable token
```

打开新终端后构建并启动：

```powershell
pnpm build
npm run start:http
```

也可直接运行 `scripts/start-http-server.ps1`。默认本地 endpoint 是 `http://127.0.0.1:8787/mcp`，最小健康探针是 `http://127.0.0.1:8787/healthz`。可通过 `MCP_HTTP_HOST`、`MCP_HTTP_PORT`、`MCP_HTTP_ENDPOINT` 覆盖；不要把 host 改为公网地址。

认证后的协议与飞书连通性烟测（使用临时随机 token，监听默认端口并在测试后自动关闭）：

```powershell
pnpm smoke:http
```

HTTP handler 使用 MCP SDK 2.0.0 的当前 Streamable HTTP 实现，并兼容 2025-era stateless 客户端。每个 MCP 请求获得独立 server 实例，但整个 HTTP 进程共享同一个 `Services`，因此 Feishu client、tenant token cache 与 Registry 没有第二套实现。

## ChatGPT：OpenAI Secure MCP Tunnel

官方推荐私有 MCP 使用 [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)：`tunnel-client` 从本机发起出站连接，无需公网 ingress 或开放防火墙端口。不要另行配置 ngrok 或第三方 Tunnel。官方 `tunnel-client` 自身可能管理其内置网络运行时，这是 Secure MCP Tunnel 的实现组成，不是本项目改用第三方公开隧道。

前置条件：

- 在 OpenAI Platform 的 Tunnels 设置创建 tunnel，取得 `tunnel_id`。
- 创建该 tunnel 的专用 runtime API key，并仅放入 `CONTROL_PLANE_API_KEY` 环境变量。
- 目标 ChatGPT workspace 与 Platform organization 已关联，并具备 developer mode / tunnel 权限。
- HTTP MCP 和 bearer token 已启动。

下载官方 [openai/tunnel-client 最新版本](https://github.com/openai/tunnel-client/releases)后执行：

```powershell
$env:CONTROL_PLANE_API_KEY = [Environment]::GetEnvironmentVariable('CONTROL_PLANE_API_KEY', 'User')
$env:MCP_HTTP_AUTHORIZATION = [Environment]::GetEnvironmentVariable('MCP_HTTP_AUTHORIZATION', 'User')
.\scripts\init-secure-tunnel.ps1 -TunnelId tunnel_xxx
.\scripts\run-secure-tunnel.ps1
```

脚本只把 `Authorization: env:MCP_HTTP_AUTHORIZATION` 引用交给 tunnel-client，真实 token 不进入参数、profile 或仓库。`doctor` 通过后，可用 tunnel-client 的本地 `/healthz`、`/readyz` 和 `/ui` 检查状态。

ChatGPT 中保持本项目设置不变，直到 tunnel healthy。之后在 Developer mode 创建自定义 app：Connection 选择 **Tunnel**，选择对应 tunnel 或填写 `tunnel_id`；名称建议 `Feishu Docs`，描述可填“通过私有 Feishu MCP 读取和维护飞书云文档”。本地 URL 和 Bearer token 不填写到 ChatGPT，静态认证头由本机 tunnel-client 注入。

## 工具访问分类

所有工具仍由同一 server factory 注册，并用 MCP 标准 annotations 明确分类：

| 分类 | 工具 |
| --- | --- |
| READ | `feishu_healthcheck`、`get_document`、`list_folder`、`search_documents` |
| WRITE | `create_document`、`append_document`、`replace_document`、`create_folder`、`grant_company_view`、`grant_company_edit`、`grant_group_edit`、`grant_user` |

在 ChatGPT Pro 当前仅允许 custom MCP read/fetch 的情况下，只使用 READ 组；WRITE 组仍保留在协议和底层架构中，未来客户端开放写能力时无需重构。

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
  http-server.ts
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

- [OpenAI MCP 与 Connectors 官方文档](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [OpenAI Secure MCP Tunnel 官方文档](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [飞书开放平台](https://open.feishu.cn/document/)
- [Lark 官方 CLI 的文档 OpenAPI 实现](https://github.com/larksuite/cli/tree/main/shortcuts/doc)
- [飞书官方：更新云文档权限设置](https://open.feishu.cn/document/server-docs/docs/permission/permission-public/patch)
- [飞书官方：增加协作者权限](https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create)

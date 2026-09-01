# Changelog

All notable changes to this project are documented here.

## [0.6.0] - 2026-09-01

### Added

- 新增飞书多维表通用 API 与 MCP tools：创建 Base、查重、数据表改名、字段增改查、记录批量增改删查、视图创建/读取。
- 新增 `grant_bitable_company_edit`，通过 Drive v2 public permission API 对 `type=bitable` 设置 `tenant_editable` 并 GET 回读确认。
- 新增 Base URL/token 解析、分页读取、500 条批量上限、Bitable scope 安全提示和完整 request-shape 回归测试。

### Verified

- 真实创建 `CR Lottery 活动移植｜项目管理`，企业内员工可编辑权限回读通过。
- 真实写入 8 张数据表、117 条记录；主 WBS 含 15 个字段、38 个唯一任务 ID 和 7 个视图。
- 13 个测试文件 / 44 项测试、TypeScript 严格构建和 Secret Scan 通过。

### Boundary

- 人员字段使用 open ID，不按姓名猜测身份；当前应用未开通通讯录读取权限时保留角色文本，待获得合法 open ID 后再写入人员字段。
- 未引入浏览器控制、用户 OAuth、凭据落盘或业务项目专属逻辑。

## [0.5.1] - 2026-08-27

### Changed

- 将唯一正式入口原位更名为 `AI Workspace｜文档导航中心`，保留同一文档与 URL；内部稳定别名、Registry 标记和旧标题迁移兼容保持防重。
- 导航中心首页改为中文三句说明；项目全景说明在“一页式项目说明”之后增加带链接的“📚 下一步推荐阅读”，其后新增面向策划的“🗺 项目工作流总览”。
- 新增基于 Drive `files.patch` / `new_title` 的标题更新、回读校验和幂等 UX 收尾脚本。

### Verified

- 真实原位更名、14 条正式文档、八分类、唯一链接、项目全景入口位置/链接、原生 Mermaid 白板块及两份文档企业内可编辑权限回读通过。
- Workspace“核心规则”“实时 Context Hub”和“当前状态与任务入口”三份既有文档完成原位更新、正文回读、自动登记与导航中心回读。
- 12 个测试文件 / 36 项测试通过；STDIO 与 Streamable HTTP 工具清单无退化。

### Fixed attempt

- 首次误用 Docx document PATCH 更新标题，飞书返回参数错误且未产生写入；改用官方 Drive 文件标题接口后，在同一文档上成功完成原位更名。
- 二次烟测发现普通文档的 project 前缀会被误判为 Hub；收紧为显式 Hub 标记或新旧官方标题，清理唯一失败测试文档后，真实创建—登记—删除—恢复再次通过。

## [0.5.0] - 2026-08-27

### Added

- 新增唯一 `AI Workspace｜Documentation Hub`、固定八分类、正式文档治理元数据和 `register_document` WRITE tool。
- 正式 `create_document` 现在强制执行文档回读、自动登记、Hub 重建与 Hub 回读；临时烟测必须显式选择 `document_kind=temporary`。
- 新增历史正式文档扫描初始化、递归 Drive 枚举、唯一性/重复链接校验，以及完整创建—登记—删除—恢复真实烟测。

### Failure semantics

- Hub 登记或回读失败时，创建流程返回失败但保留已创建文档，并明确禁止重试创建；修复后对原文档调用 `register_document`。
- 检测到多个同名 Hub、重复链接或 Hub 标题不一致时 fail closed，不创建第二个 Hub。

### Verified

- TypeScript 构建和 10 个测试文件 / 32 项测试通过；STDIO 与 Streamable HTTP 保持同一工具清单。
- 真实历史扫描登记 14 份正式文档；唯一 Hub、链接唯一、八分类和正文回读通过。
- 真实正式测试文档自动登记后已删除，Hub 恢复为 14 条；企业内可编辑权限回读为 `tenant_editable`。
- Secret Scan 仅记录安全摘要，不写入 credential、token、独立 document ID 或私有 Registry。

## [0.4.0] - 2026-08-27

### Added

- `company_readable` post-create policy and `grant_company_view` tool for Git-authoritative or otherwise read-only published documents.
- Drive v2 public-permission PATCH plus GET verification for `tenant_readable`.
- Request-shape, sharing-policy, and transport-list regression coverage for company-readable documents.
- Top-level folder creation now resolves and supplies the application root-folder token required by Drive.

### Preserved

- `company_editable` remains the default for backward compatibility.
- Group/user edit grants, private opt-out, Registry behavior, and both MCP transports are unchanged.

### Verified

- Build, eight test files / 24 tests, and secret scan passed.
- Live Drive Pilot created a top-level Context Hub folder after resolving its root token, then created seven documents without duplicates.
- Live permission GET confirmed six Git-authoritative `tenant_readable` documents and one collaborative `tenant_editable` document.

## [0.3.0] - 2026-08-26

### Added

- Default post-create permission policy: new documents become `tenant_editable` unless `sharing.mode=private` or a group/user policy is supplied.
- `grant_company_edit`, `grant_group_edit`, and `grant_user` write tools for existing documents.
- Drive v2 public-permission PATCH plus GET verification, and Drive v1 member edit grants for users and open chats.
- Safe partial-success result when enterprise policy blocks sharing, preventing duplicate-document retries.
- Permission request and post-create policy tests.

### Verified

- Live `create_document` created a test document and automatically applied `company_editable`.
- Live permission GET confirmed `link_share_entity=tenant_editable`; the current tenant policy permits the requested setting.
- STDIO and Streamable HTTP continue to expose the same eleven tools.

## [0.2.0] - 2026-08-26

### Added

- Authenticated Streamable HTTP transport at `127.0.0.1:8787/mcp` with `npm run start:http`.
- Required bearer authentication, constant-time comparison, loopback binding, Host validation, and redacted HTTP errors.
- Shared server factory and process-wide Services reuse across HTTP requests; no duplicate Feishu implementation.
- Explicit READ/WRITE tool policy and complete MCP annotations for current ChatGPT Pro read-only use and future write support.
- STDIO and HTTP regression tests, including unauthorized HTTP rejection.
- Windows helpers and documentation for the official OpenAI Secure MCP Tunnel workflow.

### Preserved

- Existing STDIO entrypoint, Windows launcher, Codex registration, all eight tools, Feishu APIs, Registry, and Markdown conversion.

### Known limitations

- Secure MCP Tunnel cannot be established until a Platform `tunnel_id` and dedicated runtime API key are available in the local environment.
- ChatGPT Pro custom MCP is documented here as READ-only according to the current account constraint; WRITE tools remain exposed with correct annotations for future enablement.

## [0.1.0] - 2026-08-25

### Added

- Local Node.js/TypeScript STDIO MCP server using MCP TypeScript SDK 2.0.0.
- Eight phase-one tools: healthcheck, create, append, replace, get, folder create/list, and Registry search.
- Enterprise self-built app authentication with in-memory tenant token caching and refresh.
- Central HTTP status/Feishu code validation, safe errors, retry, exponential backoff, and 429 handling.
- GFM Markdown semantic converter for headings, paragraphs, inline styles, links, lists, quotes, code, dividers, and tables.
- Local privacy-preserving document Registry.
- Safe full-body replacement with snapshot and rollback attempt.
- Unit tests, MCP smoke client, Secret scanner, Windows launcher, README, and agent maintenance guidance.

### Verified

- Build succeeds on Node.js 24.19.0.
- Unit suite passes.
- MCP `tools/list` returns all eight tools.
- Live `feishu_healthcheck` succeeds.
- Live smoke document creation and subsequent read/Registry lookup succeed.
- Codex global MCP entry `feishu-docs` is enabled with credential-name-only forwarding; the configured launcher returns all eight tools.

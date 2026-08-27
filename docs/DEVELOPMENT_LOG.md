# Development Log

## 2026-08-27 — 文档导航中心 UX 收尾

### 修改内容

- 唯一入口原位更名为 `AI Workspace｜文档导航中心`；稳定防重键继续使用既有 project alias 与 Registry Hub 标记，不依赖展示标题。
- 使用 Drive 文件标题接口更新展示标题并立即回读；同时兼容迁移旧展示标题，检测新旧标题并存时 fail closed。
- 项目全景说明原位增加“📚 下一步推荐阅读”，链接到同一导航中心；其后增加“🗺 项目工作流总览”，把策划目标、AI 分工、采集、证据、分析、报告、云文档和评审串成可视化链路。
- Markdown Mermaid 在飞书发布后转换为原生白板块；插入逻辑幂等，两个章节固定在“一页式项目说明”之后。
- 导航中心首页增加统一入口、自动登记和 Git 真相源三句中文说明。

### 验证方式

- 真实迁移保持同一 URL，导航中心仍为 14 条、八分类、链接唯一；旧展示标题不再存在。
- 项目全景说明的标题、章节顺序、链接目标、原生白板块和企业内可编辑权限回读通过；连续执行两次仍保持单一章节和单一文档，导航中心权限同步通过。
- Workspace“核心规则”“实时 Context Hub”和“当前状态与任务入口”使用现有文档原位更新，正文回读、自动登记和导航中心回读通过。
- TypeScript 构建和 12 个测试文件 / 36 项测试通过；真实创建—登记—删除—恢复烟测通过。

### 失败尝试与修复

- Docx document PATCH 不接受直接标题字段，返回参数错误且没有改变文档；根据官方 Drive files patch schema 改为 `new_title` 后成功。
- 首次迁移后烟测暴露 project 前缀误判；已改为仅接受显式 Hub 标记或官方新旧标题，并清理唯一失败测试文档后复验。

### 边界

- 未创建第二个导航中心或项目全景说明，未修改 ChatGPT 设置，未输出凭据、独立文档 ID 或私有 Registry。

## 2026-08-27 — Workspace Documentation Hub

### 修改内容

- 新增唯一 `AI Workspace｜Documentation Hub`，使用固定八分类自动生成正式文档目录；每条记录只展示标题、链接、简介、分类、状态和最后更新时间。
- 新增 `register_document` WRITE tool；正式 `create_document` 强制完成文档回读、Hub 登记、Hub 回读，临时文档需显式选择 `document_kind=temporary`。
- Registry 扩展为保存本机私有的治理元数据；新增历史文档扫描、递归 Drive 列举和只供验证清理使用的文件删除能力。
- 检测到同名 Hub、重复链接或回读不一致时 fail closed；创建后 Hub 更新失败不删除已创建文档，也不允许重试创建。

### 验证方式

- TypeScript 构建、10 个 test files / 32 项测试通过。
- 首次真实扫描排除 2 份历史临时连接测试，登记 14 份正式文档，八分类、唯一链接与 Hub 正文回读全部通过。
- 真实创建一份正式测试文档并自动登记；确认文档与 Hub 回读后删除测试文档，目录恢复为 14 条且 Hub 唯一。
- Hub 企业内可编辑权限 GET 回读为 `tenant_editable`；Hub 链接仅在运行结果中返回，不把独立 ID、token 或私有 Registry 写入 Git。

### 边界

- Hub 是飞书导航入口，不替代 Git 真相源；正文禁止人工维护。
- 公开 MCP 未新增删除工具；文件删除只用于可验证测试清理。
- 未新增 Feishu scope，未绕过企业管理员策略，也未修改 ChatGPT 设置。

## 2026-08-27 — 企业内只读发布权限

### 修改内容

- 新增 `sharing.mode=company_readable` 和 `grant_company_view`，使用现有 Drive v2 public permission API 设置 `tenant_readable` 并 GET 回读确认。
- 保留 `company_editable` 默认值，避免改变既有调用方行为；只读模式由调用方显式选择。
- 新增只读权限 request shape、创建后分享策略和双 transport 工具清单回归测试。
- 修复顶层 `create_folder`：先通过 root-folder metadata API 取得 token，再显式传给 Drive 创建接口。

### 用途与边界

- 用于 Git 或其他系统为 authority、飞书仅作为企业内发布入口的文档，避免把全部发布内容开放为可编辑。
- 不新增 Feishu scope，不扩大为 Wiki 实现，也不绕过企业管理员策略。

### 验证方式

- TypeScript 构建、8 个 test files / 24 项测试与 secret scan 全部通过。
- TASK-0021 Drive Context Hub 真实创建 1 个顶层文件夹和 7 份文档；Registry 与文件夹回读均为 7 个唯一标题。
- 真实权限 PATCH/GET 回读为 6 份 Git-authoritative `tenant_readable` 和 1 份协作草稿 `tenant_editable`。
- 协作页完成追加、回读、整页恢复和再次回读，临时 Pilot 内容已移除。

### 失败尝试与修复

- 旧版顶层 `create_folder` 未提供 `folder_token`，飞书返回字段校验失败；补充 root-folder metadata 查询、显式传 token 与两项回归测试后真实创建成功。

## 2026-08-26 — 创建文档后自动授权

### 修改内容

- `create_document` 默认在创建后调用 Drive v2 public permission API，把 `link_share_entity` 设为 `tenant_editable`，再 GET 回读确认。
- 支持 `sharing.mode`：`company_editable`、`group_editable`、`user_editable`、`private`。
- 新增 `grant_company_edit`、`grant_group_edit`、`grant_user` 三个 WRITE tools；群使用 `openchat`，成员权限固定为 `edit`。
- 若管理员策略或应用权限阻止授权，创建结果保留成功文档和 Registry，返回 `permission.status=failed` 与 `document_created=true`，避免客户端重试创建出重复文档。
- 新增 Drive request shape、默认权限、管理员拒绝、private opt-out 和回读不一致测试。

### 官方依据

- 飞书官方权限设置接口：`PATCH/GET /open-apis/drive/v2/permissions/:token/public`。
- 官方 SDK 枚举明确 `tenant_editable` 为“组织内获得链接的人可编辑”。
- 飞书官方协作者接口：`POST /open-apis/drive/v1/permissions/:token/members`；群类型 `openchat`，编辑权限 `edit`。

### 验证方式

- 7 个 test files、20 项测试通过，包含真实 STDIO/HTTP tools/list 回归。
- 实际创建《Codex × 飞书连接测试》，返回 `permission.status=applied`、`mode=company_editable`。
- 对新文档再次执行权限更新并 GET 回读，确认 `link_share_entity=tenant_editable`、`verified=true`。
- 当前企业共享策略允许自动设置企业内可编辑。

### 失败尝试与边界

- 首次用 `tsx -e` 做回读验证时使用 top-level await，因 eval 采用 CJS 输出而失败；改用 async IIFE 后成功，不影响服务实现。
- API 无法绕过企业管理员共享策略。策略拒绝时必须由管理员放开，再运行 `grant_*`；不得循环重试 `create_document`。

## 2026-08-26 — Codex + ChatGPT 双 transport

### 修改内容

- 把 `createServer` 变成接受共享 `Services` 的唯一 server factory；STDIO 和 HTTP 注册完全相同的 tools。
- 新增 MCP SDK 2.0.0 Streamable HTTP handler，默认 `127.0.0.1:8787/mcp`，并保留 2025-era stateless compatibility。
- MCP endpoint 强制 Bearer token、最小长度、恒定时间摘要比较与 Host allowlist；错误日志会脱敏。
- 集中定义 READ/WRITE 工具清单和 annotations。READ 为 `feishu_healthcheck`、`get_document`、`list_folder`、`search_documents`；其余现有修改工具均为 WRITE。
- 添加真实 STDIO 子进程与 HTTP client 回归测试，覆盖完整 tools/list、401 与认证成功路径。
- 增加 HTTP Windows launcher 和 OpenAI 官方 Secure MCP Tunnel 初始化/运行辅助脚本。

### 原因

ChatGPT 的 remote MCP 需要公网可达连接，而飞书凭据和 MCP server 仍应只留在本机。OpenAI 官方 Secure MCP Tunnel 采用出站连接，允许 HTTP MCP 继续仅监听 loopback；本地 Bearer token 由 tunnel-client 通过 env reference 注入，不写入 tunnel profile。

### 验证方式

- TypeScript 严格模式编译通过。
- 14 项测试通过；其中新增测试分别通过 STDIO 和 Streamable HTTP 获得相同的 8 个工具。
- HTTP 未认证请求返回 `401`，正确 Bearer token 可完成 MCP initialize 和 tools/list。
- 官方 `openai/tunnel-client` v0.0.12 Windows amd64 发行包已下载到 Git 忽略的 `.local/` 并验证可执行。

### 已知问题

- 当前机器没有 `CONTROL_PLANE_API_KEY` 和 `tunnel_id`，所以尚不能执行 tunnel control-plane 握手；需用户在 OpenAI Platform Tunnels 页面完成账户侧前置步骤。
- 不修改 ChatGPT 设置；只有 tunnel-client 的 `doctor`、`run` 和 ready 状态成功后才应在 Developer mode 中添加 app。

## 2026-08-25 — Initial infrastructure release

### 修改内容

- 建立独立 `feishu-doc-mcp` TypeScript 项目和本地 STDIO MCP Server。
- 使用稳定版 MCP TypeScript SDK 2.0.0，并按 Codex 当前 STDIO 配置方式设计启动流程。
- 实现企业自建应用 tenant token 获取、内存缓存、提前刷新和并发去重。
- 实现统一飞书 REST client：HTTP/飞书 code 双重检查、429/5xx 重试、退避、超时和安全错误。
- 实现 8 个第一阶段 MCP tools 及本地 Registry。
- 实现 GFM AST → Feishu 语义转换层；文档导入使用飞书官方 `docs_ai/v1` OpenAPI 生成原生 blocks。
- `replace_document` 实现快照、原生根 block 删除、新正文写入和失败回滚。
- 添加 Windows Node 发现/启动脚本、协议 smoke client、Secret 扫描和自动化测试。

### 原因

需要一套与具体业务项目解耦、能长期维护且不会把飞书凭据写入代码或 Codex 配置的基础设施。使用飞书官方的 Markdown 文档导入接口可以降低本地追踪复杂 block schema 的维护成本，同时保留本地语义转换层用于校验、降级和未来精确 block 操作。

### 验证方式

- 环境：Node.js 24.19.0（Codex bundled runtime）、pnpm 11.19.0、Git 2.53.0、GitHub CLI 2.97.0。
- TypeScript 严格模式编译通过。
- 自动化测试通过，覆盖 token 解析、API 错误/脱敏、paragraph、heading、bold/italic、列表、GFM table、Registry 和 URL parser。
- 独立 MCP 客户端 `tools/list` 返回 8 个预期工具。
- 实际 `feishu_healthcheck` 通过 token、API 和 `drive:drive` 权限探测。
- 实际创建并读取《Codex × 飞书连接测试》，Registry 标题查询命中。
- 使用官方 Codex CLI npm 发行包完成 `feishu-docs` 全局注册；`mcp get/list` 显示启用，配置启动命令的 `tools/list` 返回 8 个工具。

### 已知问题

- 图片和电子表格属于第二阶段，Wiki 属于第三阶段，当前只保留隔离的扩展位置。
- Codex 桌面 Windows Store 内置 `codex.exe` 从当前终端直接执行时被系统 ACL 拒绝；已改用同一官方 Codex CLI 的 npm 发行包完成注册。当前已经打开的 Codex 会话不会动态加载新 MCP，需要新会话或重启客户端。
- `get_document` 无法从标准 Docx info API 直接得到租户域名 URL 时，会优先使用 Registry 中的真实 URL，否则使用通用飞书 URL。

# Development Log

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

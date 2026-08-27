# Changelog

All notable changes to this project are documented here.

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

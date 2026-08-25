# Changelog

All notable changes to this project are documented here.

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

# AGENTS.md

## Repository purpose

This is reusable local infrastructure, not application-specific business code. It exposes Feishu/Lark document operations as a local STDIO MCP server for Codex.

## Non-negotiable credential rules

- Read `FEISHU_APP_ID` and `FEISHU_APP_SECRET` only from process environment variables.
- Never place credential values in source, tests, docs, logs, Registry data, Git history, or Codex `config.toml`.
- Never log Authorization headers, tenant tokens, request bodies for authentication, or the two environment variable values.
- Keep `.env*`, `*.secret`, `credentials*`, private keys, and token files ignored.
- Run `pnpm secret:scan` before every commit.

## Architecture boundaries

- Markdown parsing and semantic conversion belong only in `src/converters/markdown-to-feishu.ts`.
- HTTP, retry, response-code handling, and redaction belong in `src/feishu/client.ts` and `src/feishu/errors.ts`.
- Token caching and refresh belong in `src/feishu/auth.ts`.
- MCP registration and schemas belong in `src/tools/`; keep business logic in the Feishu services.
- Do not mix phase 2 Sheets/images or phase 3 Wiki work into phase 1 maintenance unless explicitly requested.

## Safe document updates

- Search the local Registry before creating a document that may already exist.
- Prefer append for additions.
- Full replace must snapshot the old content, list/delete old root blocks, write the new body, and attempt rollback on failure.
- Preserve a document's existing URL and Registry metadata when updating.

## Validation

Run `pnpm check` after code changes. Tests must continue to cover auth parsing, API error parsing, Markdown semantic conversion, tables, Registry behavior, and URL parsing. For network-affecting changes, run `pnpm smoke:health`; run `pnpm smoke:create` only when a new test document is appropriate.

Update `CHANGELOG.md` and `docs/DEVELOPMENT_LOG.md` with the reason, verification, and known limitations for material changes.

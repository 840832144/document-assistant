import type { ToolAnnotations } from '@modelcontextprotocol/server';

export const READ_TOOL_NAMES = [
  'feishu_healthcheck',
  'get_document',
  'list_folder',
  'search_documents',
] as const;

export const WRITE_TOOL_NAMES = [
  'create_document',
  'register_document',
  'append_document',
  'replace_document',
  'create_folder',
  'grant_company_view',
  'grant_company_edit',
  'grant_group_edit',
  'grant_user',
] as const;

export const READ_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const WRITE_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const DESTRUCTIVE_WRITE_TOOL_ANNOTATIONS: ToolAnnotations = {
  ...WRITE_TOOL_ANNOTATIONS,
  destructiveHint: true,
};

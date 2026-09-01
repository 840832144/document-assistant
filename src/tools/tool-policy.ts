import type { ToolAnnotations } from '@modelcontextprotocol/server';

export const READ_TOOL_NAMES = [
  'feishu_healthcheck',
  'get_document',
  'list_folder',
  'search_documents',
  'list_bitable_tables',
  'list_bitable_fields',
  'list_bitable_records',
  'list_bitable_views',
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
  'create_bitable',
  'rename_bitable_table',
  'create_bitable_table',
  'create_bitable_field',
  'update_bitable_field',
  'batch_create_bitable_records',
  'batch_update_bitable_records',
  'batch_delete_bitable_records',
  'create_bitable_view',
  'grant_bitable_company_edit',
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

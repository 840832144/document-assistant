import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { parseBitableToken } from '../feishu/bitable.js';
import { safeError } from '../feishu/errors.js';
import type { Services } from '../services.js';
import { errorResult, okResult } from './result.js';
import { READ_TOOL_ANNOTATIONS, WRITE_TOOL_ANNOTATIONS } from './tool-policy.js';

const bitableInput = z.object({
  app_token: z.string().min(1).describe('Feishu Bitable app_token or Base URL'),
});

const tableInput = bitableInput.extend({
  table_id: z.string().min(1),
});

const jsonObject = z.record(z.string(), z.unknown());

export function registerBitableTools(server: McpServer, services: Services): void {
  server.registerTool(
    'create_bitable',
    {
      description:
        'Create a Feishu Base with the company-editable policy by default. Searches Drive by exact name first to avoid duplicates, and returns the default table.',
      inputSchema: {
        name: z.string().min(1),
        folder_token: z.string().min(1).optional(),
        table_name: z.string().min(1).optional(),
        company_editable: z.boolean().default(true),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ name, folder_token, table_name, company_editable }) => {
      try {
        const drive = services.getDrive();
        const matches = (await drive.findByExactName(name)).filter((item) => item.type === 'bitable');
        if (matches.length > 1) {
          throw new Error(`Multiple Bitable files named ${name} already exist; refusing to create another.`);
        }
        if (matches[0]) {
          const appToken = matches[0].token;
          const tables = await services.getBitable().listTables(appToken);
          const permission = company_editable
            ? await drive.grantCompanyEdit(appToken, 'bitable')
            : { status: 'skipped', mode: 'private' };
          return okResult({
            status: 'existing',
            app: { app_token: appToken, name: matches[0].name, url: matches[0].url },
            tables,
            permission,
          });
        }

        const app = await services.getBitable().createApp(name, folder_token);
        let tables = await services.getBitable().listTables(app.app_token);
        if (table_name && tables[0] && tables[0].name !== table_name) {
          await services.getBitable().renameTable(app.app_token, tables[0].table_id, table_name);
          tables = await services.getBitable().listTables(app.app_token);
        }
        let permission: Record<string, unknown> = { status: 'skipped', mode: 'private' };
        if (company_editable) {
          try {
            permission = { status: 'applied', ...(await drive.grantCompanyEdit(app.app_token, 'bitable')) };
          } catch (error) {
            permission = {
              status: 'failed',
              mode: 'company_editable',
              app_created: true,
              diagnosis: safeError(error),
              next_action: 'Do not retry create_bitable. Fix permissions, then call grant_bitable_company_edit.',
            };
          }
        }
        return okResult({ status: 'created', app, tables, permission });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_bitable_tables',
    {
      description: 'List tables in a Feishu Base.',
      inputSchema: bitableInput,
      annotations: READ_TOOL_ANNOTATIONS,
    },
    async ({ app_token }) => {
      try {
        return okResult(await services.getBitable().listTables(parseBitableToken(app_token)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'rename_bitable_table',
    {
      description: 'Rename one table in a Feishu Base.',
      inputSchema: tableInput.extend({ name: z.string().min(1) }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, name }) => {
      try {
        return okResult(await services.getBitable().renameTable(parseBitableToken(app_token), table_id, name));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'create_bitable_table',
    {
      description: 'Create a new table in an existing Feishu Base, optionally with initial fields.',
      inputSchema: bitableInput.extend({
        name: z.string().min(1),
        fields: z.array(z.object({
          field_name: z.string().min(1),
          type: z.number().int().positive(),
          property: jsonObject.optional(),
        })).optional(),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, name, fields }) => {
      try {
        return okResult(await services.getBitable().createTable(parseBitableToken(app_token), {
          name,
          ...(fields ? {
            fields: fields.map((field) => ({
              field_name: field.field_name,
              type: field.type,
              ...(field.property ? { property: field.property } : {}),
            })),
          } : {}),
        }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_bitable_fields',
    {
      description: 'List fields and their types in one Feishu Base table.',
      inputSchema: tableInput,
      annotations: READ_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id }) => {
      try {
        return okResult(await services.getBitable().listFields(parseBitableToken(app_token), table_id));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'create_bitable_field',
    {
      description: 'Create a field in one Feishu Base table. Use official Bitable field type numbers and property schema.',
      inputSchema: tableInput.extend({
        field_name: z.string().min(1),
        type: z.number().int().positive(),
        property: jsonObject.optional(),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, field_name, type, property }) => {
      try {
        return okResult(
          await services.getBitable().createField(parseBitableToken(app_token), table_id, {
            field_name,
            type,
            ...(property ? { property } : {}),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'update_bitable_field',
    {
      description: 'Update a Feishu Base field name, type, and optional property using the full field definition.',
      inputSchema: tableInput.extend({
        field_id: z.string().min(1),
        field_name: z.string().min(1),
        type: z.number().int().positive(),
        property: jsonObject.optional(),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, field_id, field_name, type, property }) => {
      try {
        return okResult(
          await services.getBitable().updateField(parseBitableToken(app_token), table_id, field_id, {
            field_name,
            type,
            ...(property ? { property } : {}),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'batch_create_bitable_records',
    {
      description: 'Create 1-500 records in one Feishu Base table. Each object maps field names to native Bitable values.',
      inputSchema: tableInput.extend({ records: z.array(jsonObject).min(1).max(500) }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, records }) => {
      try {
        return okResult(
          await services.getBitable().batchCreateRecords(parseBitableToken(app_token), table_id, records),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_bitable_records',
    {
      description: 'List all records visible to the app in one Feishu Base table.',
      inputSchema: tableInput.extend({ page_size: z.number().int().min(1).max(500).default(100) }),
      annotations: READ_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, page_size }) => {
      try {
        return okResult(
          await services.getBitable().listRecords(parseBitableToken(app_token), table_id, page_size),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'batch_update_bitable_records',
    {
      description: 'Update 1-500 existing records in one Feishu Base table by record_id.',
      inputSchema: tableInput.extend({
        records: z.array(z.object({ record_id: z.string().min(1), fields: jsonObject })).min(1).max(500),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, records }) => {
      try {
        return okResult(
          await services.getBitable().batchUpdateRecords(parseBitableToken(app_token), table_id, records),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'batch_delete_bitable_records',
    {
      description: 'Delete 1-500 specified records from one Feishu Base table.',
      inputSchema: tableInput.extend({ record_ids: z.array(z.string().min(1)).min(1).max(500) }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, record_ids }) => {
      try {
        return okResult(
          await services.getBitable().batchDeleteRecords(parseBitableToken(app_token), table_id, record_ids),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'create_bitable_view',
    {
      description: 'Create a named grid, kanban, gallery, gantt, or form view in one Feishu Base table.',
      inputSchema: tableInput.extend({
        view_name: z.string().min(1),
        view_type: z.enum(['grid', 'kanban', 'gallery', 'gantt', 'form']),
      }),
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id, view_name, view_type }) => {
      try {
        return okResult(
          await services.getBitable().createView(parseBitableToken(app_token), table_id, view_name, view_type),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_bitable_views',
    {
      description: 'List all views in one Feishu Base table.',
      inputSchema: tableInput,
      annotations: READ_TOOL_ANNOTATIONS,
    },
    async ({ app_token, table_id }) => {
      try {
        return okResult(await services.getBitable().listViews(parseBitableToken(app_token), table_id));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'grant_bitable_company_edit',
    {
      description:
        'Allow everyone in the current Feishu tenant who has the link to edit a Base, then GET the permission back to verify tenant_editable.',
      inputSchema: bitableInput,
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    async ({ app_token }) => {
      try {
        return okResult(await services.getDrive().grantCompanyEdit(parseBitableToken(app_token), 'bitable'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

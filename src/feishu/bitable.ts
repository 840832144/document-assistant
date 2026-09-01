import { FeishuApiError } from './errors.js';
import type { FeishuClient } from './client.js';

interface ApiEnvelope<T> {
  code: number;
  data: T;
}

type JsonObject = Record<string, unknown>;

export interface BitableApp {
  app_token: string;
  name: string;
  url: string;
}

export interface BitableTable {
  table_id: string;
  name: string;
  revision?: number;
}

export interface BitableField {
  field_id: string;
  field_name: string;
  type: number;
  is_primary?: boolean;
  property?: JsonObject;
}

export interface BitableRecord {
  record_id: string;
  fields: JsonObject;
  created_time?: number;
  last_modified_time?: number;
}

export interface BitableView {
  view_id: string;
  view_name: string;
  view_type: string;
}

export interface BitableFieldInput {
  field_name: string;
  type: number;
  property?: JsonObject;
}

export interface BitableTableInput {
  name: string;
  fields?: BitableFieldInput[];
}

export class FeishuBitableApi {
  constructor(private readonly client: FeishuClient) {}

  async createApp(name: string, folderToken?: string): Promise<BitableApp> {
    const api = 'bitable/v1/apps';
    const response = await this.client.request<ApiEnvelope<{ app?: JsonObject }>>('POST', api, {
      body: {
        name,
        ...(folderToken ? { folder_token: folderToken } : {}),
      },
    });
    const app = response.data.app ?? {};
    const appToken = stringField(app, 'app_token');
    if (!appToken) throw new FeishuApiError({ api, message: 'Create Bitable response did not contain app_token' });
    return {
      app_token: appToken,
      name: stringField(app, 'name') || name,
      url: stringField(app, 'url') || buildBitableUrl(appToken),
    };
  }

  async listTables(appToken: string): Promise<BitableTable[]> {
    return this.listItems<BitableTable>(`bitable/v1/apps/${encodeURIComponent(appToken)}/tables`);
  }

  async createTable(appToken: string, table: BitableTableInput): Promise<BitableTable> {
    const api = `bitable/v1/apps/${encodeURIComponent(appToken)}/tables`;
    const response = await this.client.request<ApiEnvelope<{ table_id?: string; table?: BitableTable }>>('POST', api, {
      body: { table },
    });
    const created = response.data.table;
    if (created?.table_id) return created;
    if (response.data.table_id) return { table_id: response.data.table_id, name: table.name };
    throw new FeishuApiError({ api, message: 'Create table response did not contain table_id' });
  }

  async renameTable(appToken: string, tableId: string, name: string): Promise<BitableTable> {
    const api = `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}`;
    const response = await this.client.request<ApiEnvelope<{ table?: BitableTable }>>('PATCH', api, {
      body: { name },
    });
    return response.data.table ?? { table_id: tableId, name };
  }

  async listFields(appToken: string, tableId: string): Promise<BitableField[]> {
    return this.listItems<BitableField>(
      `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
    );
  }

  async createField(appToken: string, tableId: string, field: BitableFieldInput): Promise<BitableField> {
    const api = `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`;
    const response = await this.client.request<ApiEnvelope<{ field?: BitableField }>>('POST', api, {
      body: field,
    });
    const created = response.data.field;
    if (!created?.field_id) throw new FeishuApiError({ api, message: 'Create field response did not contain field_id' });
    return created;
  }

  async updateField(
    appToken: string,
    tableId: string,
    fieldId: string,
    field: BitableFieldInput,
  ): Promise<BitableField> {
    const api =
      `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}` +
      `/fields/${encodeURIComponent(fieldId)}`;
    const response = await this.client.request<ApiEnvelope<{ field?: BitableField }>>('PUT', api, {
      body: field,
    });
    return response.data.field ?? { field_id: fieldId, ...field };
  }

  async batchCreateRecords(appToken: string, tableId: string, records: JsonObject[]): Promise<BitableRecord[]> {
    if (records.length < 1 || records.length > 500) {
      throw new Error('batchCreateRecords requires between 1 and 500 records per request');
    }
    const api =
      `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}` +
      '/records/batch_create';
    const response = await this.client.request<ApiEnvelope<{ records?: BitableRecord[] }>>('POST', api, {
      query: { user_id_type: 'open_id' },
      body: { records: records.map((fields) => ({ fields })) },
    });
    return response.data.records ?? [];
  }

  async batchUpdateRecords(
    appToken: string,
    tableId: string,
    records: Array<{ record_id: string; fields: JsonObject }>,
  ): Promise<BitableRecord[]> {
    if (records.length < 1 || records.length > 500) {
      throw new Error('batchUpdateRecords requires between 1 and 500 records per request');
    }
    const api =
      `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}` +
      '/records/batch_update';
    const response = await this.client.request<ApiEnvelope<{ records?: BitableRecord[] }>>('POST', api, {
      query: { user_id_type: 'open_id' },
      body: { records },
    });
    return response.data.records ?? [];
  }

  async batchDeleteRecords(appToken: string, tableId: string, recordIds: string[]): Promise<string[]> {
    if (recordIds.length < 1 || recordIds.length > 500) {
      throw new Error('batchDeleteRecords requires between 1 and 500 record IDs per request');
    }
    const api =
      `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}` +
      '/records/batch_delete';
    const response = await this.client.request<ApiEnvelope<{ records?: string[] }>>('POST', api, {
      body: { records: recordIds },
    });
    return response.data.records ?? recordIds;
  }

  async listRecords(appToken: string, tableId: string, pageSize = 100): Promise<BitableRecord[]> {
    return this.listItems<BitableRecord>(
      `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
      { page_size: Math.min(500, Math.max(1, pageSize)), user_id_type: 'open_id' },
    );
  }

  async createView(appToken: string, tableId: string, viewName: string, viewType: string): Promise<BitableView> {
    const api = `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`;
    const response = await this.client.request<ApiEnvelope<{ view?: BitableView }>>('POST', api, {
      body: { view_name: viewName, view_type: viewType },
    });
    const view = response.data.view;
    if (!view?.view_id) throw new FeishuApiError({ api, message: 'Create view response did not contain view_id' });
    return view;
  }

  async listViews(appToken: string, tableId: string): Promise<BitableView[]> {
    return this.listItems<BitableView>(
      `bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`,
    );
  }

  private async listItems<T>(
    api: string,
    initialQuery: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
      const response = await this.client.request<
        ApiEnvelope<{ items?: T[]; has_more?: boolean; page_token?: string; next_page_token?: string }>
      >('GET', api, {
        query: {
          page_size: 100,
          ...initialQuery,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      items.push(...(response.data.items ?? []));
      pageToken = response.data.has_more
        ? response.data.page_token ?? response.data.next_page_token
        : undefined;
    } while (pageToken);
    return items;
  }
}

export function parseBitableToken(input: string): string {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{8,}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Expected a Feishu/Lark Bitable app_token or Base URL');
  }
  const match = url.pathname.match(/\/(?:base|bitable)\/([A-Za-z0-9_-]+)/i);
  if (!match?.[1]) throw new Error('URL does not contain a Feishu/Lark Bitable app token');
  return match[1];
}

function stringField(record: JsonObject, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function buildBitableUrl(appToken: string): string {
  return `https://feishu.cn/base/${appToken}`;
}

import { describe, expect, it, vi } from 'vitest';
import { FeishuBitableApi, parseBitableToken } from '../src/feishu/bitable.js';
import type { FeishuClient } from '../src/feishu/client.js';

function mockBitable() {
  const request = vi.fn();
  return {
    request,
    bitable: new FeishuBitableApi({ request } as unknown as FeishuClient),
  };
}

describe('Bitable API', () => {
  it('creates an app without exposing or persisting credentials', async () => {
    const { bitable, request } = mockBitable();
    request.mockResolvedValue({
      code: 0,
      data: { app: { app_token: 'bascnTestToken', name: 'Lottery', url: 'https://example.invalid/base' } },
    });

    await expect(bitable.createApp('Lottery', 'folder-token')).resolves.toEqual({
      app_token: 'bascnTestToken',
      name: 'Lottery',
      url: 'https://example.invalid/base',
    });
    expect(request).toHaveBeenCalledWith('POST', 'bitable/v1/apps', {
      body: { name: 'Lottery', folder_token: 'folder-token' },
    });
  });

  it('paginates table metadata', async () => {
    const { bitable, request } = mockBitable();
    request
      .mockResolvedValueOnce({
        code: 0,
        data: { items: [{ table_id: 'tbl1', name: 'A' }], has_more: true, page_token: 'next' },
      })
      .mockResolvedValueOnce({ code: 0, data: { items: [{ table_id: 'tbl2', name: 'B' }] } });

    await expect(bitable.listTables('base/unsafe')).resolves.toHaveLength(2);
    expect(request).toHaveBeenNthCalledWith(2, 'GET', 'bitable/v1/apps/base%2Funsafe/tables', {
      query: { page_size: 100, page_token: 'next' },
    });
  });

  it('creates a table with the official nested table body', async () => {
    const { bitable, request } = mockBitable();
    request.mockResolvedValue({ code: 0, data: { table_id: 'tbl1' } });

    await expect(bitable.createTable('base1', { name: '里程碑' })).resolves.toEqual({
      table_id: 'tbl1',
      name: '里程碑',
    });
    expect(request).toHaveBeenCalledWith('POST', 'bitable/v1/apps/base1/tables', {
      body: { table: { name: '里程碑' } },
    });
  });

  it('creates native records with open_id person semantics', async () => {
    const { bitable, request } = mockBitable();
    request.mockResolvedValue({
      code: 0,
      data: { records: [{ record_id: 'rec1', fields: { 任务: '联调' } }] },
    });

    await bitable.batchCreateRecords('base1', 'table1', [{ 任务: '联调' }]);
    expect(request).toHaveBeenCalledWith('POST', 'bitable/v1/apps/base1/tables/table1/records/batch_create', {
      query: { user_id_type: 'open_id' },
      body: { records: [{ fields: { 任务: '联调' } }] },
    });
  });

  it('updates and deletes records in batches', async () => {
    const { bitable, request } = mockBitable();
    request
      .mockResolvedValueOnce({ code: 0, data: { records: [{ record_id: 'rec1', fields: { 状态: '进行中' } }] } })
      .mockResolvedValueOnce({ code: 0, data: { records: ['rec1'] } });

    await bitable.batchUpdateRecords('base1', 'table1', [{ record_id: 'rec1', fields: { 状态: '进行中' } }]);
    await bitable.batchDeleteRecords('base1', 'table1', ['rec1']);

    expect(request).toHaveBeenNthCalledWith(1, 'POST', 'bitable/v1/apps/base1/tables/table1/records/batch_update', {
      query: { user_id_type: 'open_id' },
      body: { records: [{ record_id: 'rec1', fields: { 状态: '进行中' } }] },
    });
    expect(request).toHaveBeenNthCalledWith(2, 'POST', 'bitable/v1/apps/base1/tables/table1/records/batch_delete', {
      body: { records: ['rec1'] },
    });
  });

  it('creates typed views and parses Base URLs', async () => {
    const { bitable, request } = mockBitable();
    request.mockResolvedValue({
      code: 0,
      data: { view: { view_id: 'vew1', view_name: '进度看板', view_type: 'kanban' } },
    });

    await bitable.createView('base1', 'table1', '进度看板', 'kanban');
    expect(request).toHaveBeenCalledWith('POST', 'bitable/v1/apps/base1/tables/table1/views', {
      body: { view_name: '进度看板', view_type: 'kanban' },
    });
    expect(parseBitableToken('https://example.feishu.cn/base/bascnTestToken?table=tbl1')).toBe('bascnTestToken');
  });
});

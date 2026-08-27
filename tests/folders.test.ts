import { describe, expect, it, vi } from 'vitest';
import type { FeishuClient } from '../src/feishu/client.js';
import { FeishuDriveApi } from '../src/feishu/drive.js';

describe('Drive folder API', () => {
  it('resolves the application root token before creating a top-level folder', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, data: { token: 'root-token' } })
      .mockResolvedValueOnce({ code: 0, data: { token: 'new-folder', url: 'https://example.invalid/folder' } });
    const drive = new FeishuDriveApi({ request } as unknown as FeishuClient);

    const result = await drive.createFolder('Context Hub');

    expect(request).toHaveBeenNthCalledWith(1, 'GET', 'drive/explorer/v2/root_folder/meta');
    expect(request).toHaveBeenNthCalledWith(2, 'POST', 'drive/v1/files/create_folder', {
      body: { name: 'Context Hub', folder_token: 'root-token' },
    });
    expect(result.folder_token).toBe('new-folder');
  });

  it('uses an explicit parent token without a root lookup', async () => {
    const request = vi.fn().mockResolvedValue({ code: 0, data: { token: 'new-folder' } });
    const drive = new FeishuDriveApi({ request } as unknown as FeishuClient);

    await drive.createFolder('Context Hub', 'parent-token');

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('POST', 'drive/v1/files/create_folder', {
      body: { name: 'Context Hub', folder_token: 'parent-token' },
    });
  });
});

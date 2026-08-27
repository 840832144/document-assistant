import { describe, expect, it, vi } from 'vitest';
import { FeishuDriveApi } from '../src/feishu/drive.js';
import type { FeishuClient } from '../src/feishu/client.js';

describe('document title update', () => {
  it('uses the Drive file-title endpoint with the documented new_title field', async () => {
    const request = vi.fn().mockResolvedValue({ code: 0, data: {} });
    const drive = new FeishuDriveApi({ request } as unknown as FeishuClient);

    await drive.updateFileTitle('doc-hub', 'AI Workspace｜文档导航中心');

    expect(request).toHaveBeenCalledWith('PATCH', 'drive/v1/files/doc-hub', {
      query: { type: 'docx' },
      body: { new_title: 'AI Workspace｜文档导航中心' },
    });
  });
});

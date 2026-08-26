import { describe, expect, it, vi } from 'vitest';
import type { FeishuClient } from '../src/feishu/client.js';
import { FeishuApiError } from '../src/feishu/errors.js';
import { FeishuDriveApi } from '../src/feishu/drive.js';
import type { Services } from '../src/services.js';
import { applyDocumentSharing } from '../src/tools/create-document.js';

function mockDrive() {
  const request = vi.fn().mockResolvedValue({ code: 0, data: {} });
  const drive = new FeishuDriveApi({ request } as unknown as FeishuClient);
  return { drive, request };
}

describe('Drive permission API', () => {
  it('sets company link sharing to tenant editable', async () => {
    const { drive, request } = mockDrive();
    request
      .mockResolvedValueOnce({ code: 0, data: {} })
      .mockResolvedValueOnce({
        code: 0,
        data: { permission_public: { link_share_entity: 'tenant_editable' } },
      });

    const result = await drive.grantCompanyEdit('docx/unsafe');

    expect(request).toHaveBeenNthCalledWith(1, 'PATCH', 'drive/v2/permissions/docx%2Funsafe/public', {
      query: { type: 'docx' },
      body: { link_share_entity: 'tenant_editable' },
    });
    expect(request).toHaveBeenNthCalledWith(2, 'GET', 'drive/v2/permissions/docx%2Funsafe/public', {
      query: { type: 'docx' },
    });
    expect(result).toMatchObject({ target_type: 'company', permission: 'edit', verified: true });
  });

  it('grants edit permission to an open chat without notification by default', async () => {
    const { drive, request } = mockDrive();

    const result = await drive.grantMemberEdit('docx12345678', 'openchat', 'oc_test');

    expect(request).toHaveBeenCalledWith('POST', 'drive/v1/permissions/docx12345678/members', {
      query: { type: 'docx', need_notification: false },
      body: { member_type: 'openchat', member_id: 'oc_test', perm: 'edit' },
    });
    expect(result).toMatchObject({ target_type: 'openchat', target_id: 'oc_test', permission: 'edit' });
  });

  it('rejects an unconfirmed company permission update', async () => {
    const { drive, request } = mockDrive();
    request
      .mockResolvedValueOnce({ code: 0, data: {} })
      .mockResolvedValueOnce({ code: 0, data: { permission_public: { link_share_entity: 'closed' } } });

    await expect(drive.grantCompanyEdit('docx12345678')).rejects.toThrow('was not confirmed');
  });
});

describe('post-create sharing', () => {
  it('defaults every new document to company editable', async () => {
    const grantCompanyEdit = vi.fn().mockResolvedValue({
      document_id: 'docx12345678',
      target_type: 'company',
      permission: 'edit',
      link_share_entity: 'tenant_editable',
    });
    const services = { getDrive: () => ({ grantCompanyEdit }) } as unknown as Services;

    const result = await applyDocumentSharing(services, 'docx12345678', undefined);

    expect(grantCompanyEdit).toHaveBeenCalledWith('docx12345678');
    expect(result).toMatchObject({ status: 'applied', mode: 'company_editable' });
  });

  it('does not turn a successful create into a retryable failure when admin policy blocks sharing', async () => {
    const grantCompanyEdit = vi.fn().mockRejectedValue(
      new FeishuApiError({
        api: 'drive/v2/permissions/docx12345678/public',
        message: 'Permission denied by tenant policy',
        httpStatus: 403,
        feishuCode: 1063003,
      }),
    );
    const services = { getDrive: () => ({ grantCompanyEdit }) } as unknown as Services;

    const result = await applyDocumentSharing(services, 'docx12345678', undefined);

    expect(result).toMatchObject({
      status: 'failed',
      mode: 'company_editable',
      document_created: true,
    });
    expect(result.next_action).toContain('Do not retry create_document');
  });

  it('can opt out for a private document', async () => {
    const services = { getDrive: vi.fn() } as unknown as Services;
    await expect(applyDocumentSharing(services, 'docx12345678', { mode: 'private' })).resolves.toEqual({
      status: 'skipped',
      mode: 'private',
    });
    expect(services.getDrive).not.toHaveBeenCalled();
  });
});

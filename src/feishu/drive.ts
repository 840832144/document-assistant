import type { FeishuClient } from './client.js';
import { FeishuApiError } from './errors.js';

interface ApiEnvelope<T> {
  code: number;
  data: T;
}

export interface DriveItem {
  token: string;
  name: string;
  type: string;
  url?: string;
  parent_token?: string;
  created_time?: string;
  modified_time?: string;
}

export type PermissionMemberType = 'email' | 'openid' | 'unionid' | 'openchat' | 'userid';

export interface PermissionGrantResult {
  document_id: string;
  permission: 'read' | 'edit';
  target_type: 'company' | PermissionMemberType;
  target_id?: string;
  link_share_entity?: 'tenant_readable' | 'tenant_editable';
  verified?: boolean;
}

export class FeishuDriveApi {
  constructor(private readonly client: FeishuClient) {}

  async createFolder(name: string, parentFolderToken?: string): Promise<{ folder_token: string; url: string }> {
    const folderToken = parentFolderToken ?? (await this.getRootFolderToken());
    const api = 'drive/v1/files/create_folder';
    const response = await this.client.request<
      ApiEnvelope<{ token?: string; url?: string; folder_token?: string }>
    >('POST', api, {
      body: {
        name,
        folder_token: folderToken,
      },
    });
    const token = response.data.token ?? response.data.folder_token;
    if (!token) throw new Error('Create folder response did not contain a folder token');
    return {
      folder_token: token,
      url: response.data.url ?? `https://feishu.cn/drive/folder/${token}`,
    };
  }

  async getRootFolderToken(): Promise<string> {
    const api = 'drive/explorer/v2/root_folder/meta';
    const response = await this.client.request<ApiEnvelope<{ token?: string; root_folder_token?: string }>>(
      'GET',
      api,
    );
    const token = response.data.token ?? response.data.root_folder_token;
    if (!token) throw new Error('Root folder metadata did not contain a folder token');
    return token;
  }

  async listFolder(folderToken: string): Promise<DriveItem[]> {
    const api = 'drive/v1/files';
    const items: DriveItem[] = [];
    let pageToken: string | undefined;
    do {
      const response = await this.client.request<
        ApiEnvelope<{ files?: DriveItem[]; has_more?: boolean; next_page_token?: string; page_token?: string }>
      >('GET', api, {
        query: {
          folder_token: folderToken,
          page_size: 200,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      items.push(...(response.data.files ?? []));
      pageToken = response.data.has_more
        ? response.data.next_page_token ?? response.data.page_token
        : undefined;
    } while (pageToken);
    return items;
  }

  async listAllFiles(): Promise<DriveItem[]> {
    const rootToken = await this.getRootFolderToken();
    const queue = [rootToken];
    const visited = new Set<string>();
    const files: DriveItem[] = [];
    while (queue.length > 0) {
      const folderToken = queue.shift();
      if (!folderToken || visited.has(folderToken)) continue;
      visited.add(folderToken);
      if (visited.size > 1_000) throw new Error('Drive folder scan exceeded the safe 1,000-folder limit.');
      const items = await this.listFolder(folderToken);
      for (const item of items) {
        files.push(item);
        if (item.type === 'folder') queue.push(item.token);
      }
    }
    return files;
  }

  async findByExactName(name: string): Promise<DriveItem[]> {
    return (await this.listAllFiles()).filter((item) => item.name === name);
  }

  async findByExactNames(names: readonly string[]): Promise<DriveItem[]> {
    const expected = new Set(names);
    return (await this.listAllFiles()).filter((item) => expected.has(item.name));
  }

  async deleteFile(fileToken: string, type = 'docx'): Promise<void> {
    await this.client.request('DELETE', `drive/v1/files/${encodeURIComponent(fileToken)}`, {
      query: { type },
    });
  }

  async updateFileTitle(fileToken: string, newTitle: string, type = 'docx'): Promise<void> {
    await this.client.request('PATCH', `drive/v1/files/${encodeURIComponent(fileToken)}`, {
      query: { type },
      body: { new_title: newTitle },
    });
  }

  async grantCompanyEdit(documentId: string): Promise<PermissionGrantResult> {
    return this.grantCompanyLink(documentId, 'tenant_editable', 'edit');
  }

  async grantCompanyView(documentId: string): Promise<PermissionGrantResult> {
    return this.grantCompanyLink(documentId, 'tenant_readable', 'read');
  }

  private async grantCompanyLink(
    documentId: string,
    linkShareEntity: 'tenant_readable' | 'tenant_editable',
    permission: 'read' | 'edit',
  ): Promise<PermissionGrantResult> {
    const api = `drive/v2/permissions/${encodeURIComponent(documentId)}/public`;
    await this.client.request<ApiEnvelope<{ permission_public?: { link_share_entity?: string } }>>('PATCH', api, {
      query: { type: 'docx' },
      body: { link_share_entity: linkShareEntity },
    });
    const verified = await this.client.request<
      ApiEnvelope<{ permission_public?: { link_share_entity?: string } }>
    >('GET', api, { query: { type: 'docx' } });
    if (verified.data.permission_public?.link_share_entity !== linkShareEntity) {
      throw new FeishuApiError({
        api,
        message: `Permission update was not confirmed: link_share_entity is not ${linkShareEntity}`,
      });
    }
    return {
      document_id: documentId,
      permission,
      target_type: 'company',
      link_share_entity: linkShareEntity,
      verified: true,
    };
  }

  async grantMemberEdit(
    documentId: string,
    memberType: PermissionMemberType,
    memberId: string,
    needNotification = false,
  ): Promise<PermissionGrantResult> {
    const api = `drive/v1/permissions/${encodeURIComponent(documentId)}/members`;
    await this.client.request<ApiEnvelope<{ member?: Record<string, unknown> }>>('POST', api, {
      query: { type: 'docx', need_notification: needNotification },
      body: {
        member_type: memberType,
        member_id: memberId,
        perm: 'edit',
      },
    });
    return {
      document_id: documentId,
      permission: 'edit',
      target_type: memberType,
      target_id: memberId,
    };
  }
}

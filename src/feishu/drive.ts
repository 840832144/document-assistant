import type { FeishuClient } from './client.js';

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

export class FeishuDriveApi {
  constructor(private readonly client: FeishuClient) {}

  async createFolder(name: string, parentFolderToken?: string): Promise<{ folder_token: string; url: string }> {
    const api = 'drive/v1/files/create_folder';
    const response = await this.client.request<
      ApiEnvelope<{ token?: string; url?: string; folder_token?: string }>
    >('POST', api, {
      body: {
        name,
        ...(parentFolderToken ? { folder_token: parentFolderToken } : {}),
      },
    });
    const token = response.data.token ?? response.data.folder_token;
    if (!token) throw new Error('Create folder response did not contain a folder token');
    return {
      folder_token: token,
      url: response.data.url ?? `https://feishu.cn/drive/folder/${token}`,
    };
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
}

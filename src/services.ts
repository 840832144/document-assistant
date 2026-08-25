import { getConfigStatus, loadConfig } from './config.js';
import { FeishuClient } from './feishu/client.js';
import { FeishuDocsApi } from './feishu/docs.js';
import { FeishuDriveApi } from './feishu/drive.js';
import { DocumentRegistry } from './registry.js';

export class Services {
  readonly registry = new DocumentRegistry(getConfigStatus().registryPath);
  private client?: FeishuClient;
  private docsApi?: FeishuDocsApi;
  private driveApi?: FeishuDriveApi;

  getClient(): FeishuClient {
    this.client ??= new FeishuClient(loadConfig());
    return this.client;
  }

  getDocs(): FeishuDocsApi {
    this.docsApi ??= new FeishuDocsApi(this.getClient());
    return this.docsApi;
  }

  getDrive(): FeishuDriveApi {
    this.driveApi ??= new FeishuDriveApi(this.getClient());
    return this.driveApi;
  }
}

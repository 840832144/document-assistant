import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENTATION_CATEGORIES, DocumentRegistry } from '../src/registry.js';
import { DOCUMENTATION_HUB_TITLE, DocumentationHubService } from '../src/documentation-hub.js';
import type { FeishuDocsApi } from '../src/feishu/docs.js';
import type { FeishuDriveApi } from '../src/feishu/drive.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('Documentation Hub service', () => {
  it('creates one canonical Hub, renders every fixed category, and readbacks a unique generated index', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'documentation-hub-'));
    directories.push(directory);
    const registry = new DocumentRegistry(join(directory, 'registry.json'));
    await registry.upsert({
      document_id: 'doc-formal-1',
      title: '正式报告',
      url: 'https://tenant.example/docx/formal-1',
      project: 'AI-Workspace',
    });

    let hubBody = '';
    const createDocument = vi.fn().mockResolvedValue({
      document_id: 'doc-hub-1',
      title: DOCUMENTATION_HUB_TITLE,
      url: 'https://tenant.example/docx/hub-1',
    });
    const getDocument = vi.fn(async (id: string) => {
      if (id === 'doc-hub-1') {
        return {
          document_id: id,
          title: DOCUMENTATION_HUB_TITLE,
          url: 'https://tenant.example/docx/hub-1',
          plain_text: hubBody,
          blocks: [],
        };
      }
      return {
        document_id: id,
        title: '正式报告',
        url: 'https://tenant.example/docx/formal-1',
        plain_text: '报告正文',
        blocks: [],
      };
    });
    const replaceDocument = vi.fn(async (_id: string, converted: { markdown: string }) => {
      hubBody = converted.markdown;
    });
    const docs = { createDocument, getDocument, replaceDocument } as unknown as FeishuDocsApi;
    const drive = {
      findByExactName: vi.fn().mockResolvedValue([]),
      grantCompanyEdit: vi.fn().mockResolvedValue({ verified: true }),
    } as unknown as FeishuDriveApi;
    const service = new DocumentationHubService(registry, docs, drive);

    const result = await service.registerDocument({
      documentId: 'doc-formal-1',
      category: '📊 报告',
      description: '用于验证自动登记的正式报告。',
      status: 'Review',
    });

    expect(result).toMatchObject({
      hub_title: DOCUMENTATION_HUB_TITLE,
      registered_documents: 2,
      unique_links: true,
      readback_verified: true,
    });
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(drive.grantCompanyEdit).toHaveBeenCalledWith('doc-hub-1');
    for (const category of DOCUMENTATION_CATEGORIES) expect(hubBody).toContain(`## ${category}`);
    expect(hubBody).toContain('正式报告');
    expect(hubBody).toContain('不接受人工维护目录');
    expect(hubBody).not.toContain('document_id');
    expect((hubBody.match(/https:\/\/tenant\.example\/docx\/formal-1/g) ?? [])).toHaveLength(1);
  });

  it('fails closed when Feishu contains more than one canonical Hub title', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'documentation-hub-duplicate-'));
    directories.push(directory);
    const registry = new DocumentRegistry(join(directory, 'registry.json'));
    const docs = {} as FeishuDocsApi;
    const drive = {
      findByExactName: vi.fn().mockResolvedValue([
        { token: 'hub-1', name: DOCUMENTATION_HUB_TITLE, type: 'docx' },
        { token: 'hub-2', name: DOCUMENTATION_HUB_TITLE, type: 'docx' },
      ]),
    } as unknown as FeishuDriveApi;
    const service = new DocumentationHubService(registry, docs, drive);

    await expect(service.refreshHub()).rejects.toThrow('multiple Feishu documents');
  });

  it('rejects duplicate links before replacing the Hub body', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'documentation-hub-links-'));
    directories.push(directory);
    const registry = new DocumentRegistry(join(directory, 'registry.json'));
    await registry.upsert({ document_id: 'hub-1', title: DOCUMENTATION_HUB_TITLE, url: 'https://tenant.example/docx/hub' });
    await registry.setDocumentation('hub-1', {
      category: '🏗 项目介绍',
      description: '唯一入口。',
      status: 'Accepted',
      registered_at: new Date().toISOString(),
    }, { isHub: true });
    for (const id of ['doc-a', 'doc-b']) {
      await registry.upsert({ document_id: id, title: id, url: 'https://tenant.example/docx/duplicate' });
      await registry.setDocumentation(id, {
        category: '📊 报告',
        description: '重复链接测试。',
        status: 'Draft',
        registered_at: new Date().toISOString(),
      });
    }
    const docs = {
      getDocument: vi.fn().mockResolvedValue({
        document_id: 'hub-1',
        title: DOCUMENTATION_HUB_TITLE,
        url: 'https://tenant.example/docx/hub',
        plain_text: '',
        blocks: [],
      }),
      replaceDocument: vi.fn(),
    } as unknown as FeishuDocsApi;
    const drive = {
      findByExactName: vi.fn().mockResolvedValue([{ token: 'hub-1', name: DOCUMENTATION_HUB_TITLE, type: 'docx' }]),
    } as unknown as FeishuDriveApi;
    const service = new DocumentationHubService(registry, docs, drive);

    await expect(service.refreshHub()).rejects.toThrow('duplicate link');
    expect(docs.replaceDocument).not.toHaveBeenCalled();
  });
});

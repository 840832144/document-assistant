import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENTATION_CATEGORIES, DocumentRegistry } from '../src/registry.js';
import {
  DOCUMENTATION_HUB_PROJECT,
  DOCUMENTATION_HUB_TITLE,
  LEGACY_DOCUMENTATION_HUB_TITLE,
  DocumentationHubService,
} from '../src/documentation-hub.js';
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
      findByExactNames: vi.fn().mockResolvedValue([]),
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
    expect(hubBody).toContain('本文档是 AI Workspace 所有正式云文档的统一导航入口');
    expect(hubBody).toContain('正式文档都会自动登记到这里');
    expect(hubBody).toContain('Git 仍是真相源，本页只负责导航');
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
      findByExactNames: vi.fn().mockResolvedValue([
        { token: 'hub-1', name: DOCUMENTATION_HUB_TITLE, type: 'docx' },
        { token: 'hub-2', name: LEGACY_DOCUMENTATION_HUB_TITLE, type: 'docx' },
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
      findByExactNames: vi.fn().mockResolvedValue([{ token: 'hub-1', name: DOCUMENTATION_HUB_TITLE, type: 'docx' }]),
    } as unknown as FeishuDriveApi;
    const service = new DocumentationHubService(registry, docs, drive);

    await expect(service.refreshHub()).rejects.toThrow('duplicate link');
    expect(docs.replaceDocument).not.toHaveBeenCalled();
  });

  it('renames the legacy display title in place while preserving the stable alias and document identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'documentation-hub-rename-'));
    directories.push(directory);
    const registry = new DocumentRegistry(join(directory, 'registry.json'));
    await registry.upsert({
      document_id: 'hub-existing',
      title: LEGACY_DOCUMENTATION_HUB_TITLE,
      url: 'https://tenant.example/docx/hub-existing',
      project: DOCUMENTATION_HUB_PROJECT,
      is_documentation_hub: true,
    });
    let body = '';
    const getDocument = vi.fn().mockResolvedValue({
      document_id: 'hub-existing',
      title: LEGACY_DOCUMENTATION_HUB_TITLE,
      url: 'https://tenant.example/docx/hub-existing',
      plain_text: body,
      blocks: [],
    });
    const updateFileTitle = vi.fn(async () => {
      getDocument.mockResolvedValue({
        document_id: 'hub-existing',
        title: DOCUMENTATION_HUB_TITLE,
        url: 'https://tenant.example/docx/hub-existing',
        plain_text: body,
        blocks: [],
      });
    });
    const replaceDocument = vi.fn(async (_id: string, converted: { markdown: string }) => {
      body = converted.markdown;
      getDocument.mockResolvedValue({
        document_id: 'hub-existing',
        title: DOCUMENTATION_HUB_TITLE,
        url: 'https://tenant.example/docx/hub-existing',
        plain_text: body,
        blocks: [],
      });
    });
    const docs = { getDocument, replaceDocument } as unknown as FeishuDocsApi;
    const drive = {
      findByExactNames: vi.fn().mockResolvedValue([
        { token: 'hub-existing', name: LEGACY_DOCUMENTATION_HUB_TITLE, type: 'docx' },
      ]),
      updateFileTitle,
    } as unknown as FeishuDriveApi;

    const result = await new DocumentationHubService(registry, docs, drive).refreshHub();

    expect(result.hub_title).toBe(DOCUMENTATION_HUB_TITLE);
    expect(result.hub_url).toBe('https://tenant.example/docx/hub-existing');
    expect(updateFileTitle).toHaveBeenCalledWith('hub-existing', DOCUMENTATION_HUB_TITLE);
    expect((await registry.get('hub-existing'))).toMatchObject({
      title: DOCUMENTATION_HUB_TITLE,
      project: DOCUMENTATION_HUB_PROJECT,
      is_documentation_hub: true,
    });
  });

  it('does not treat an ordinary document that merely shares the project prefix as the Hub', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'documentation-hub-project-prefix-'));
    directories.push(directory);
    const registry = new DocumentRegistry(join(directory, 'registry.json'));
    await registry.upsert({
      document_id: 'ordinary-doc',
      title: '普通正式文档',
      url: 'https://tenant.example/docx/ordinary-doc',
      project: 'AI-Workspace-Documentation-Hub-Smoke',
    });
    let body = '';
    const docs = {
      createDocument: vi.fn().mockResolvedValue({
        document_id: 'actual-hub',
        title: DOCUMENTATION_HUB_TITLE,
        url: 'https://tenant.example/docx/actual-hub',
      }),
      replaceDocument: vi.fn(async (_id: string, converted: { markdown: string }) => {
        body = converted.markdown;
      }),
      getDocument: vi.fn().mockImplementation(async (id: string) => ({
        document_id: id,
        title: id === 'actual-hub' ? DOCUMENTATION_HUB_TITLE : '普通正式文档',
        url: `https://tenant.example/docx/${id}`,
        plain_text: id === 'actual-hub' ? body : '正文',
        blocks: [],
      })),
    } as unknown as FeishuDocsApi;
    const drive = {
      findByExactNames: vi.fn().mockResolvedValue([]),
      grantCompanyEdit: vi.fn().mockResolvedValue({ verified: true }),
    } as unknown as FeishuDriveApi;

    const result = await new DocumentationHubService(registry, docs, drive).refreshHub();

    expect(result.hub_title).toBe(DOCUMENTATION_HUB_TITLE);
    expect(docs.createDocument).toHaveBeenCalledTimes(1);
  });
});

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentRegistry } from '../src/registry.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('document registry', () => {
  it('upserts and searches by title, project, and id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'feishu-registry-'));
    directories.push(directory);
    const path = join(directory, 'document-registry.json');
    const registry = new DocumentRegistry(path);
    await registry.upsert({
      document_id: 'docx12345678',
      title: 'Huuuge 数值体系报告',
      url: 'https://feishu.cn/docx/docx12345678',
      project: 'Huuuge',
    });
    expect(await registry.search({ title: '数值体系' })).toHaveLength(1);
    expect(await registry.search({ project: 'huuuge' })).toHaveLength(1);
    expect(await registry.search({ document_id: 'docx12345678' })).toHaveLength(1);
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveLength(1);
  });

  it('stores private Documentation Hub metadata and supports validated cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'feishu-registry-documentation-'));
    directories.push(directory);
    const path = join(directory, 'document-registry.json');
    const registry = new DocumentRegistry(path);
    await registry.upsert({
      document_id: 'docx12345678',
      title: '正式文档',
      url: 'https://feishu.cn/docx/docx12345678',
    });
    await registry.setDocumentation('docx12345678', {
      category: '📚 知识库',
      description: '正式知识文档。',
      status: 'Accepted',
      registered_at: '2026-08-27T00:00:00.000Z',
    });

    expect(await registry.get('docx12345678')).toMatchObject({
      documentation: { category: '📚 知识库', status: 'Accepted' },
    });
    await expect(registry.remove('docx12345678')).resolves.toBe(true);
    expect(await registry.list()).toEqual([]);
  });
});

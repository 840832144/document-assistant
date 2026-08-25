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
});

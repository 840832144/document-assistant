import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface RegistryEntry {
  document_id: string;
  title: string;
  url: string;
  folder_token?: string;
  project?: string;
  created_at: string;
  updated_at: string;
  documentation?: DocumentationMetadata;
  is_documentation_hub?: boolean;
}

export const DOCUMENTATION_CATEGORIES = [
  '🏗 项目介绍',
  '🎮 游戏研究',
  '🧰 工具',
  '📄 部署',
  '📊 报告',
  '📚 知识库',
  '📝 标准 / Workflow / Capability',
  '📦 Archive',
] as const;

export const DOCUMENTATION_STATUSES = ['Draft', 'Review', 'Accepted', 'Archived'] as const;

export type DocumentationCategory = (typeof DOCUMENTATION_CATEGORIES)[number];
export type DocumentationStatus = (typeof DOCUMENTATION_STATUSES)[number];

export interface DocumentationMetadata {
  category: DocumentationCategory;
  description: string;
  status: DocumentationStatus;
  registered_at: string;
}

export interface RegistrySearch {
  title?: string;
  project?: string;
  document_id?: string;
}

export class DocumentRegistry {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(readonly path: string) {}

  async list(): Promise<RegistryEntry[]> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Registry root must be a JSON array');
      return parsed.filter(isRegistryEntry);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async search(query: RegistrySearch): Promise<RegistryEntry[]> {
    const entries = await this.list();
    const title = query.title?.trim().toLocaleLowerCase();
    const project = query.project?.trim().toLocaleLowerCase();
    const documentId = query.document_id?.trim();
    return entries
      .filter((entry) => !documentId || entry.document_id === documentId)
      .filter((entry) => !title || entry.title.toLocaleLowerCase().includes(title))
      .filter((entry) => !project || entry.project?.toLocaleLowerCase().includes(project))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async get(documentId: string): Promise<RegistryEntry | undefined> {
    return (await this.list()).find((entry) => entry.document_id === documentId);
  }

  async upsert(
    input: Omit<RegistryEntry, 'created_at' | 'updated_at'> & Partial<Pick<RegistryEntry, 'created_at' | 'updated_at'>>,
  ): Promise<RegistryEntry> {
    let result!: RegistryEntry;
    await this.enqueue(async () => {
      const entries = await this.list();
      const index = entries.findIndex((entry) => entry.document_id === input.document_id);
      const now = new Date().toISOString();
      const previous = index >= 0 ? entries[index] : undefined;
      result = {
        document_id: input.document_id,
        title: input.title,
        url: input.url,
        ...(input.folder_token ? { folder_token: input.folder_token } : previous?.folder_token ? { folder_token: previous.folder_token } : {}),
        ...(input.project ? { project: input.project } : previous?.project ? { project: previous.project } : {}),
        created_at: input.created_at ?? previous?.created_at ?? now,
        updated_at: input.updated_at ?? now,
        ...(input.documentation
          ? { documentation: input.documentation }
          : previous?.documentation
            ? { documentation: previous.documentation }
            : {}),
        ...(input.is_documentation_hub !== undefined
          ? { is_documentation_hub: input.is_documentation_hub }
          : previous?.is_documentation_hub !== undefined
            ? { is_documentation_hub: previous.is_documentation_hub }
            : {}),
      };
      if (index >= 0) entries[index] = result;
      else entries.push(result);
      await this.write(entries);
    });
    return result;
  }

  async touch(documentId: string): Promise<RegistryEntry | undefined> {
    const existing = await this.get(documentId);
    if (!existing) return undefined;
    return this.upsert({ ...existing, updated_at: new Date().toISOString() });
  }

  async setDocumentation(
    documentId: string,
    documentation: DocumentationMetadata,
    options: { isHub?: boolean; preserveUpdatedAt?: boolean } = {},
  ): Promise<RegistryEntry> {
    const existing = await this.get(documentId);
    if (!existing) throw new Error('Cannot register a document that is not present in the local Registry.');
    return this.upsert({
      ...existing,
      documentation,
      ...(options.isHub !== undefined ? { is_documentation_hub: options.isHub } : {}),
      ...(options.preserveUpdatedAt ? { updated_at: existing.updated_at } : {}),
    });
  }

  async remove(documentId: string): Promise<boolean> {
    let removed = false;
    await this.enqueue(async () => {
      const entries = await this.list();
      const next = entries.filter((entry) => entry.document_id !== documentId);
      removed = next.length !== entries.length;
      if (removed) await this.write(next);
    });
    return removed;
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private async write(entries: RegistryEntry[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(entries, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }
}

function isRegistryEntry(value: unknown): value is RegistryEntry {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const documentation = record.documentation;
  const documentationIsValid =
    documentation === undefined ||
    (isRecord(documentation) &&
      DOCUMENTATION_CATEGORIES.includes(documentation.category as DocumentationCategory) &&
      typeof documentation.description === 'string' &&
      DOCUMENTATION_STATUSES.includes(documentation.status as DocumentationStatus) &&
      typeof documentation.registered_at === 'string');
  return (
    typeof record.document_id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.url === 'string' &&
    typeof record.created_at === 'string' &&
    typeof record.updated_at === 'string' &&
    documentationIsValid &&
    (record.is_documentation_hub === undefined || typeof record.is_documentation_hub === 'boolean')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

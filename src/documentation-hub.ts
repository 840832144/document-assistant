import { markdownToFeishu } from './converters/markdown-to-feishu.js';
import type { FeishuDocsApi } from './feishu/docs.js';
import type { DriveItem, FeishuDriveApi } from './feishu/drive.js';
import {
  DOCUMENTATION_CATEGORIES,
  type DocumentationCategory,
  type DocumentationMetadata,
  type DocumentationStatus,
  type DocumentRegistry,
  type RegistryEntry,
} from './registry.js';

export const DOCUMENTATION_HUB_TITLE = 'AI Workspace｜Documentation Hub';
export const DOCUMENTATION_HUB_PROJECT = 'AI-Workspace-Documentation-Hub';

export interface RegisterDocumentInput {
  documentId: string;
  category: DocumentationCategory;
  description: string;
  status: DocumentationStatus;
  preserveUpdatedAt?: boolean;
}

export interface DocumentationHubResult {
  hub_title: string;
  hub_url: string;
  registered_documents: number;
  unique_links: boolean;
  readback_verified: boolean;
}

export class DocumentationHubService {
  constructor(
    private readonly registry: DocumentRegistry,
    private readonly docs: FeishuDocsApi,
    private readonly drive: FeishuDriveApi,
  ) {}

  async registerDocument(input: RegisterDocumentInput): Promise<DocumentationHubResult & { document_title: string; document_url: string }> {
    const snapshot = await this.docs.getDocument(input.documentId);
    const existing = await this.registry.get(input.documentId);
    const registered = await this.registry.upsert({
      document_id: snapshot.document_id,
      title: snapshot.title,
      url: preferTenantDocumentUrl(snapshot.document_id, snapshot.url, await this.registry.list()),
      ...(existing?.folder_token ? { folder_token: existing.folder_token } : {}),
      ...(existing?.project ? { project: existing.project } : {}),
      ...(existing?.created_at ? { created_at: existing.created_at } : {}),
      ...(input.preserveUpdatedAt && existing?.updated_at ? { updated_at: existing.updated_at } : {}),
      documentation: metadata(input.category, input.description, input.status, existing?.documentation?.registered_at),
      ...(snapshot.title === DOCUMENTATION_HUB_TITLE ? { is_documentation_hub: true } : {}),
    });
    const result = await this.refreshHub();
    return { ...result, document_title: registered.title, document_url: registered.url };
  }

  async initializeHistoricalDocuments(): Promise<DocumentationHubResult & { scanned: number; excluded_temporary: number }> {
    const [registryEntries, remoteItems] = await Promise.all([
      this.registry.list(),
      this.drive.listAllFiles(),
    ]);
    const byId = new Map(registryEntries.map((entry) => [entry.document_id, entry]));
    let excludedTemporary = 0;

    for (const item of remoteItems) {
      if (!isDocumentItem(item) || byId.has(item.token)) continue;
      const historical = historicalMetadata(item.name, undefined);
      if (!historical) continue;
      const snapshot = await this.docs.getDocument(item.token);
      const registered = await this.registry.upsert({
        document_id: snapshot.document_id,
        title: snapshot.title,
        url: snapshot.url,
        ...(item.parent_token ? { folder_token: item.parent_token } : {}),
        ...(toIsoTime(item.created_time) ? { created_at: toIsoTime(item.created_time)! } : {}),
        ...(toIsoTime(item.modified_time) ? { updated_at: toIsoTime(item.modified_time)! } : {}),
        documentation: metadata(historical.category, historical.description, historical.status),
      });
      byId.set(registered.document_id, registered);
    }

    for (const entry of byId.values()) {
      if (entry.title === DOCUMENTATION_HUB_TITLE) continue;
      const historical = historicalMetadata(entry.title, entry.project);
      if (!historical) {
        if (isTemporaryDocument(entry)) excludedTemporary += 1;
        continue;
      }
      const snapshot = await this.docs.getDocument(entry.document_id);
      await this.registry.upsert({
        ...entry,
        title: snapshot.title,
        url: snapshot.url,
        updated_at: entry.updated_at,
        documentation: metadata(
          historical.category,
          historical.description,
          historical.status,
          entry.documentation?.registered_at,
        ),
      });
    }

    const result = await this.refreshHub();
    return {
      ...result,
      scanned: (await this.registry.list()).filter((entry) => entry.documentation).length,
      excluded_temporary: excludedTemporary,
    };
  }

  async refreshHub(): Promise<DocumentationHubResult> {
    const hub = await this.ensureUniqueHub();
    const entries = (await this.registry.list())
      .filter((entry) => entry.documentation)
      .sort(compareDocumentationEntries);
    validateUniqueLinks(entries);
    const markdown = renderHub(entries);
    await this.docs.replaceDocument(hub.document_id, markdownToFeishu(markdown));
    await this.registry.touch(hub.document_id);
    const readback = await this.docs.getDocument(hub.document_id);
    verifyHubReadback(readback.title, readback.plain_text, entries);
    return {
      hub_title: readback.title,
      hub_url: hub.url,
      registered_documents: entries.length,
      unique_links: true,
      readback_verified: true,
    };
  }

  async removeDocumentForValidatedCleanup(documentId: string): Promise<DocumentationHubResult> {
    const entry = await this.registry.get(documentId);
    if (!entry) throw new Error('Validated cleanup target is not present in the local Registry.');
    if (entry.is_documentation_hub) throw new Error('The Documentation Hub cannot be removed by cleanup.');
    await this.drive.deleteFile(documentId, 'docx');
    await this.registry.remove(documentId);
    return this.refreshHub();
  }

  private async ensureUniqueHub(): Promise<RegistryEntry> {
    const localMatches = (await this.registry.list()).filter((entry) => entry.title === DOCUMENTATION_HUB_TITLE);
    if (localMatches.length > 1) throw new Error('Documentation Hub uniqueness check failed: multiple local Registry entries exist.');

    const remoteMatches = (await this.drive.findByExactName(DOCUMENTATION_HUB_TITLE)).filter(isDocumentItem);
    if (remoteMatches.length > 1) throw new Error('Documentation Hub uniqueness check failed: multiple Feishu documents exist.');

    const local = localMatches[0];
    const remote = remoteMatches[0];
    if (local && remote && local.document_id !== remote.token) {
      throw new Error('Documentation Hub uniqueness check failed: local and Feishu records point to different documents.');
    }

    let hub = local;
    if (!hub && remote) {
      const snapshot = await this.docs.getDocument(remote.token);
      const entries = await this.registry.list();
      hub = await this.registry.upsert({
        document_id: snapshot.document_id,
        title: snapshot.title,
        url: preferTenantDocumentUrl(snapshot.document_id, remote.url ?? snapshot.url, entries),
        ...(remote.parent_token ? { folder_token: remote.parent_token } : {}),
        project: DOCUMENTATION_HUB_PROJECT,
        documentation: hubMetadata(),
        is_documentation_hub: true,
      });
    }

    if (!hub) {
      const entries = await this.registry.list();
      const created = await this.docs.createDocument(
        DOCUMENTATION_HUB_TITLE,
        markdownToFeishu(renderHub([])),
      );
      hub = await this.registry.upsert({
        ...created,
        url: preferTenantDocumentUrl(created.document_id, created.url, entries),
        project: DOCUMENTATION_HUB_PROJECT,
        documentation: hubMetadata(),
        is_documentation_hub: true,
      });
      await this.drive.grantCompanyEdit(created.document_id);
    } else {
      const snapshot = await this.docs.getDocument(hub.document_id);
      if (snapshot.title !== DOCUMENTATION_HUB_TITLE) {
        throw new Error('Documentation Hub Registry entry no longer resolves to the canonical title.');
      }
      hub = await this.registry.upsert({
        ...hub,
        title: snapshot.title,
        url: preferTenantDocumentUrl(snapshot.document_id, hub.url || snapshot.url, await this.registry.list()),
        documentation: hubMetadata(hub.documentation?.registered_at),
        is_documentation_hub: true,
        updated_at: hub.updated_at,
      });
    }
    return hub;
  }
}

function hubMetadata(registeredAt?: string): DocumentationMetadata {
  return metadata(
    '🏗 项目介绍',
    'Workspace 所有正式飞书文档的唯一导航入口；Git 仍是规则与状态的真相源。',
    'Accepted',
    registeredAt,
  );
}

function metadata(
  category: DocumentationCategory,
  description: string,
  status: DocumentationStatus,
  registeredAt?: string,
): DocumentationMetadata {
  const normalized = normalizeDescription(description);
  if (!normalized) throw new Error('Documentation description must contain one non-empty sentence.');
  return {
    category,
    description: normalized,
    status,
    registered_at: registeredAt ?? new Date().toISOString(),
  };
}

function renderHub(entries: RegistryEntry[]): string {
  const lines = [
    '> 本文档由 AI Document Assistant 自动维护。Git 仍是规则、Task、状态和实现证据的真相源；本文档只提供飞书导航，不接受人工维护目录。',
    '',
    `最后自动刷新：${formatTimestamp(new Date().toISOString())}`,
    '',
  ];
  for (const category of DOCUMENTATION_CATEGORIES) {
    lines.push(`## ${category}`, '');
    const categoryEntries = entries.filter((entry) => entry.documentation?.category === category);
    if (categoryEntries.length === 0) {
      lines.push('暂无登记文档。', '');
      continue;
    }
    lines.push('| 文档标题 | 飞书链接 | 一句话介绍 | 所属分类 | 状态 | 最后更新时间 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const entry of categoryEntries) {
      const documentation = entry.documentation!;
      lines.push(
        `| ${escapeCell(entry.title)} | [打开文档](${entry.url}) | ${escapeCell(documentation.description)} | ${escapeCell(documentation.category)} | ${documentation.status} | ${formatTimestamp(entry.updated_at)} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function validateUniqueLinks(entries: RegistryEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalized = entry.url.trim().toLocaleLowerCase();
    if (seen.has(normalized)) throw new Error(`Documentation Hub contains a duplicate link for title: ${entry.title}`);
    seen.add(normalized);
  }
}

function verifyHubReadback(title: string, plainText: string, entries: RegistryEntry[]): void {
  if (title !== DOCUMENTATION_HUB_TITLE) throw new Error('Documentation Hub readback title does not match the canonical title.');
  for (const category of DOCUMENTATION_CATEGORIES) {
    if (!plainText.includes(category)) throw new Error(`Documentation Hub readback is missing category: ${category}`);
  }
  for (const entry of entries) {
    if (!plainText.includes(entry.title)) throw new Error(`Documentation Hub readback is missing document: ${entry.title}`);
  }
}

function historicalMetadata(
  title: string,
  project: string | undefined,
): Pick<DocumentationMetadata, 'category' | 'description' | 'status'> | undefined {
  const known = HISTORICAL_DOCUMENTS.get(title);
  if (known) return known;
  if (project === 'feishu-doc-mcp' || /连接测试|自动登记测试/.test(title)) return undefined;
  if (project === 'AI-Workspace-Context-Hub') {
    return {
      category: '📚 知识库',
      description: 'Workspace Live Context 的正式协作或导航文档。',
      status: 'Accepted',
    };
  }
  if (project === 'AI-Workspace') {
    return {
      category: '🏗 项目介绍',
      description: 'AI Workspace 的正式项目说明或状态文档。',
      status: 'Review',
    };
  }
  if (project === 'huuuge-android-research') {
    return {
      category: '🎮 游戏研究',
      description: 'Huuuge 游戏研究项目的正式文档。',
      status: 'Review',
    };
  }
  return undefined;
}

const HISTORICAL_DOCUMENTS = new Map<string, Pick<DocumentationMetadata, 'category' | 'description' | 'status'>>([
  ['Game Planner AI Workspace｜项目全景说明', { category: '🏗 项目介绍', description: '介绍 Game Planner AI Workspace 的目标、边界、架构与协作方式。', status: 'Review' }],
  ['Game Planner AI Workspace｜项目进度与能力状态', { category: '📊 报告', description: '汇总 Workspace 当前任务、能力、阻塞项与下一阶段进度。', status: 'Review' }],
  ['Huuuge 数据采集器部署手册', { category: '📄 部署', description: '指导策划在新电脑安装、检查、启动和维护 Huuuge Collector。', status: 'Accepted' }],
  ['Huuuge Casino Android 数据采集简报（含 Slots Spin 示例）', { category: '🎮 游戏研究', description: '说明 Huuuge 数据采集范围、证据结构与 Slots 示例。', status: 'Accepted' }],
  ['Huuuge 新人上手指南（First Run Guide）', { category: '📄 部署', description: '帮助新策划按步骤完成采集、生成 Markdown 并写入飞书。', status: 'Review' }],
  ['Huuuge Lottery 活动数值拆解（2026-08-27）', { category: '📊 报告', description: '基于运行数据拆解 Lottery 玩法、票务、奖励、充值与策划建议。', status: 'Review' }],
  ['Game Planner AI Workspace｜实时 Context Hub', { category: '🧰 工具', description: '提供 Workspace Live Context 的状态、入口与协作导航。', status: 'Accepted' }],
  ['核心规则', { category: '📝 标准 / Workflow / Capability', description: '汇总 Workspace 的稳定核心规则与安全边界。', status: 'Accepted' }],
  ['系统上下文与能力边界', { category: '📝 标准 / Workflow / Capability', description: '说明 Workspace 系统组成、Capability 边界与真相源。', status: 'Accepted' }],
  ['当前状态与任务入口', { category: '🏗 项目介绍', description: '提供当前任务、状态、Review 与执行入口。', status: 'Accepted' }],
  ['策划协作与待确认事项', { category: '📚 知识库', description: '收集策划协作草稿、讨论结论与待确认事项。', status: 'Draft' }],
  ['AI 行文规范', { category: '📝 标准 / Workflow / Capability', description: '定义面向策划的中文行文、步骤和排版要求。', status: 'Accepted' }],
  ['Capability / Workflow / Skill 索引', { category: '📝 标准 / Workflow / Capability', description: '统一导航 Workspace Capability、Workflow 与 Skill。', status: 'Accepted' }],
]);

function compareDocumentationEntries(left: RegistryEntry, right: RegistryEntry): number {
  const categoryDifference =
    DOCUMENTATION_CATEGORIES.indexOf(left.documentation!.category) -
    DOCUMENTATION_CATEGORIES.indexOf(right.documentation!.category);
  if (categoryDifference !== 0) return categoryDifference;
  return left.title.localeCompare(right.title, 'zh-CN');
}

function isDocumentItem(item: DriveItem): boolean {
  return item.type === 'docx' || item.type === 'doc';
}

function isTemporaryDocument(entry: RegistryEntry): boolean {
  return entry.project === 'feishu-doc-mcp' || /连接测试|自动登记测试/.test(entry.title);
}

function normalizeDescription(value: string): string {
  return value.replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function toIsoTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const milliseconds = /^\d+$/.test(value) ? Number(value) * 1_000 : Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  return new Date(milliseconds).toISOString();
}

function preferTenantDocumentUrl(documentId: string, candidate: string, entries: RegistryEntry[]): string {
  try {
    const candidateUrl = new URL(candidate);
    if (candidateUrl.hostname !== 'feishu.cn' && candidateUrl.hostname !== 'www.feishu.cn') return candidate;
  } catch {
    // Fall through to a known tenant URL when the provider omitted a usable URL.
  }
  for (const entry of entries) {
    try {
      const url = new URL(entry.url);
      if (url.hostname.endsWith('.feishu.cn')) return `${url.origin}/docx/${documentId}`;
    } catch {
      // Ignore malformed historical Registry URLs and keep looking.
    }
  }
  return candidate;
}

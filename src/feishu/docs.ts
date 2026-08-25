import type { FeishuMarkdownDocument } from '../converters/markdown-to-feishu.js';
import { FeishuApiError } from './errors.js';
import type { FeishuClient } from './client.js';

interface ApiEnvelope<T> {
  code: number;
  msg?: string;
  data: T;
}

export interface DocumentResult {
  document_id: string;
  title: string;
  url: string;
}

export interface FeishuBlock {
  block_id: string;
  block_type: number;
  parent_id?: string;
  children?: string[];
  [key: string]: unknown;
}

export interface DocumentSnapshot {
  document_id: string;
  title: string;
  url: string;
  plain_text: string;
  blocks: Array<{ block_id: string; block_type: number; parent_id?: string; text: string }>;
}

export class FeishuDocsApi {
  constructor(private readonly client: FeishuClient) {}

  async createDocument(
    title: string,
    document: FeishuMarkdownDocument,
    folderToken?: string,
  ): Promise<DocumentResult> {
    const api = 'docs_ai/v1/documents';
    const response = await this.client.request<ApiEnvelope<{ document?: Record<string, unknown>; result?: string; warnings?: unknown[] }>>(
      'POST',
      api,
      {
        body: {
          format: 'markdown',
          content: `<title>${escapeXml(title)}</title>\n${document.markdown}`,
          ...(folderToken ? { parent_token: folderToken } : {}),
        },
      },
    );
    assertDocsOperation(api, response.data);
    const created = response.data.document ?? {};
    const documentId = stringField(created, 'document_id');
    if (!documentId) throw new FeishuApiError({ api, message: 'Create response did not contain document_id' });
    return {
      document_id: documentId,
      title: stringField(created, 'title') || title,
      url: stringField(created, 'url') || buildDocumentUrl(documentId),
    };
  }

  async appendDocument(documentId: string, document: FeishuMarkdownDocument): Promise<void> {
    const api = `docs_ai/v1/documents/${encodeURIComponent(documentId)}`;
    const response = await this.client.request<ApiEnvelope<{ result?: string; warnings?: unknown[] }>>('PUT', api, {
      body: {
        format: 'markdown',
        command: 'block_insert_after',
        block_id: '-1',
        revision_id: -1,
        content: document.markdown,
      },
    });
    assertDocsOperation(api, response.data);
  }

  async replaceDocument(documentId: string, document: FeishuMarkdownDocument): Promise<void> {
    const snapshot = await this.fetchMarkdown(documentId);
    const blocks = await this.listBlocks(documentId);
    const root = blocks.find((block) => block.block_id === documentId);
    const childCount = root?.children?.length ?? blocks.filter((block) => block.parent_id === documentId).length;

    if (childCount > 0) {
      await this.deleteRootChildren(documentId, childCount);
    }

    try {
      if (document.markdown.trim()) await this.appendDocument(documentId, document);
    } catch (writeError) {
      try {
        if (snapshot.trim()) {
          await this.appendDocument(documentId, { blocks: [], markdown: snapshot, warnings: [] });
        }
      } catch (rollbackError) {
        throw new Error(
          `Replacement failed and rollback also failed. Document ${documentId} may have an empty body. ` +
            `Write error: ${errorMessage(writeError)}; rollback error: ${errorMessage(rollbackError)}`,
        );
      }
      throw new Error(`Replacement failed; original body was restored. ${errorMessage(writeError)}`);
    }
  }

  async getDocument(documentId: string): Promise<DocumentSnapshot> {
    const [info, blocks, raw] = await Promise.all([
      this.getDocumentInfo(documentId),
      this.listBlocks(documentId),
      this.getRawContent(documentId).catch(() => ''),
    ]);
    const title = stringField(info, 'title') || 'Untitled';
    const simplified = blocks
      .filter((block) => block.block_id !== documentId)
      .map((block) => ({
        block_id: block.block_id,
        block_type: block.block_type,
        ...(block.parent_id ? { parent_id: block.parent_id } : {}),
        text: extractBlockText(block),
      }));
    return {
      document_id: documentId,
      title,
      url: stringField(info, 'url') || buildDocumentUrl(documentId),
      plain_text: raw || simplified.map((item) => item.text).filter(Boolean).join('\n'),
      blocks: simplified,
    };
  }

  async getDocumentInfo(documentId: string): Promise<Record<string, unknown>> {
    const api = `docx/v1/documents/${encodeURIComponent(documentId)}`;
    const response = await this.client.request<ApiEnvelope<{ document?: Record<string, unknown> }>>('GET', api);
    return response.data.document ?? {};
  }

  async getRawContent(documentId: string): Promise<string> {
    const api = `docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`;
    const response = await this.client.request<ApiEnvelope<{ content?: string }>>('GET', api);
    return response.data.content ?? '';
  }

  async fetchMarkdown(documentId: string): Promise<string> {
    const api = `docs_ai/v1/documents/${encodeURIComponent(documentId)}/fetch`;
    const response = await this.client.request<ApiEnvelope<{ document?: { content?: string } }>>('POST', api, {
      body: {
        format: 'markdown',
        export_option: {
          export_block_id: false,
          export_style_attrs: false,
          export_cite_extra_data: false,
        },
      },
    });
    return response.data.document?.content ?? '';
  }

  async listBlocks(documentId: string): Promise<FeishuBlock[]> {
    const api = `docx/v1/documents/${encodeURIComponent(documentId)}/blocks`;
    const items: FeishuBlock[] = [];
    let pageToken: string | undefined;
    do {
      const response = await this.client.request<
        ApiEnvelope<{ items?: FeishuBlock[]; has_more?: boolean; page_token?: string }>
      >('GET', api, {
        query: {
          page_size: 200,
          document_revision_id: -1,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      items.push(...(response.data.items ?? []));
      pageToken = response.data.has_more ? response.data.page_token : undefined;
    } while (pageToken);
    return items;
  }

  private async deleteRootChildren(documentId: string, childCount: number): Promise<void> {
    const api = `docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}/children/batch_delete`;
    await this.client.request('DELETE', api, {
      query: { document_revision_id: -1 },
      body: { start_index: 0, end_index: childCount },
    });
  }
}

export function parseDocumentId(input: string): string {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{8,}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Expected a Feishu/Lark document_id or document URL');
  }
  const match = url.pathname.match(/\/(?:docx|docs)\/([A-Za-z0-9_-]+)/i);
  if (!match?.[1]) throw new Error('URL does not contain a Feishu/Lark document token');
  return match[1];
}

function assertDocsOperation(api: string, data: { result?: string; warnings?: unknown[] }): void {
  if (data.result && data.result !== 'success') {
    throw new FeishuApiError({
      api,
      message: `Document operation returned ${data.result}${data.warnings ? `: ${JSON.stringify(data.warnings)}` : ''}`,
    });
  }
}

function extractBlockText(block: FeishuBlock): string {
  for (const value of Object.values(block)) {
    if (!value || typeof value !== 'object') continue;
    const elements = (value as { elements?: unknown[] }).elements;
    if (!Array.isArray(elements)) continue;
    return elements
      .map((element) => {
        if (!element || typeof element !== 'object') return '';
        const record = element as Record<string, unknown>;
        for (const key of ['text_run', 'equation', 'mention_user', 'mention_doc']) {
          const child = record[key];
          if (child && typeof child === 'object') {
            const content = (child as Record<string, unknown>).content;
            if (typeof content === 'string') return content;
          }
        }
        return '';
      })
      .join('');
  }
  return '';
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildDocumentUrl(documentId: string): string {
  return `https://feishu.cn/docx/${documentId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

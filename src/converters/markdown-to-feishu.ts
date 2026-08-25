import type { Root, RootContent, PhrasingContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

export interface FeishuTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

export type FeishuSemanticBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: FeishuTextRun[] }
  | { type: 'paragraph'; runs: FeishuTextRun[] }
  | { type: 'bullet'; runs: FeishuTextRun[]; depth: number }
  | { type: 'ordered'; runs: FeishuTextRun[]; depth: number; ordinal?: number }
  | { type: 'quote'; runs: FeishuTextRun[] }
  | { type: 'code'; code: string; language?: string }
  | { type: 'divider' }
  | { type: 'table'; rows: FeishuTextRun[][][] };

export interface FeishuMarkdownDocument {
  blocks: FeishuSemanticBlock[];
  markdown: string;
  warnings: string[];
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, {
  bullet: '-',
  fences: true,
  listItemIndent: 'one',
});

export function markdownToFeishu(markdown: string): FeishuMarkdownDocument {
  if (typeof markdown !== 'string') throw new TypeError('markdown must be a string');
  const tree = processor.parse(normalizeNewlines(markdown)) as Root;
  const warnings: string[] = [];
  const blocks = convertRoot(tree, warnings);
  let normalized = String(processor.stringify(tree)).trimEnd();
  if (/<\/?title\b/i.test(normalized)) {
    normalized = normalized.replace(/<\/?title\b[^>]*>/gi, '');
    warnings.push('Removed user-supplied <title> tags; create_document.title is authoritative.');
  }
  return { blocks, markdown: normalized, warnings };
}

function convertRoot(root: Root, warnings: string[]): FeishuSemanticBlock[] {
  const blocks: FeishuSemanticBlock[] = [];
  for (const node of root.children) convertBlock(node, blocks, warnings, 0);
  return blocks;
}

function convertBlock(
  node: RootContent,
  blocks: FeishuSemanticBlock[],
  warnings: string[],
  depth: number,
): void {
  switch (node.type) {
    case 'heading':
      blocks.push({
        type: 'heading',
        level: Math.min(node.depth, 3) as 1 | 2 | 3,
        runs: inlineRuns(node.children),
      });
      if (node.depth > 3) warnings.push(`Heading level ${node.depth} was downgraded to level 3.`);
      return;
    case 'paragraph':
      blocks.push({ type: 'paragraph', runs: inlineRuns(node.children) });
      return;
    case 'list': {
      let ordinal = node.start ?? 1;
      for (const item of node.children) {
        const runs = inlineRunsFromUnknown(item.children);
        if (node.ordered) {
          blocks.push({ type: 'ordered', runs, depth, ordinal });
          ordinal += 1;
        } else {
          blocks.push({ type: 'bullet', runs, depth });
        }
        for (const child of item.children) {
          if (child.type === 'list') convertBlock(child, blocks, warnings, depth + 1);
        }
      }
      return;
    }
    case 'blockquote':
      blocks.push({ type: 'quote', runs: inlineRunsFromUnknown(node.children) });
      return;
    case 'code':
      blocks.push({
        type: 'code',
        code: node.value,
        ...(node.lang ? { language: node.lang } : {}),
      });
      return;
    case 'thematicBreak':
      blocks.push({ type: 'divider' });
      return;
    case 'table': {
      const table = node as unknown as {
        children: Array<{ children: Array<{ children: PhrasingContent[] }> }>;
      };
      blocks.push({
        type: 'table',
        rows: table.children.map((row) => row.children.map((cell) => inlineRuns(cell.children))),
      });
      return;
    }
    case 'html':
      blocks.push({ type: 'paragraph', runs: [{ text: node.value }] });
      warnings.push('Raw HTML is passed through as plain semantic text and may be simplified by Feishu.');
      return;
    default: {
      const text = plainText(node);
      if (text) blocks.push({ type: 'paragraph', runs: [{ text }] });
      else warnings.push(`Unsupported Markdown node "${node.type}" was skipped.`);
    }
  }
}

function inlineRuns(nodes: PhrasingContent[], marks: Omit<FeishuTextRun, 'text'> = {}): FeishuTextRun[] {
  const runs: FeishuTextRun[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        pushRun(runs, { text: node.value, ...marks });
        break;
      case 'strong':
        appendRuns(runs, inlineRuns(node.children, { ...marks, bold: true }));
        break;
      case 'emphasis':
        appendRuns(runs, inlineRuns(node.children, { ...marks, italic: true }));
        break;
      case 'inlineCode':
        pushRun(runs, { text: node.value, ...marks, code: true });
        break;
      case 'link':
        appendRuns(runs, inlineRuns(node.children, { ...marks, link: node.url }));
        break;
      case 'break':
        pushRun(runs, { text: '\n', ...marks });
        break;
      case 'image':
        pushRun(runs, { text: node.alt ?? node.url, ...marks, link: node.url });
        break;
      case 'delete':
        appendRuns(runs, inlineRuns(node.children, marks));
        break;
      default:
        pushRun(runs, { text: plainText(node), ...marks });
    }
  }
  return runs;
}

function inlineRunsFromUnknown(nodes: unknown[]): FeishuTextRun[] {
  const runs: FeishuTextRun[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const record = node as { type?: string; children?: unknown[]; value?: string };
    if (record.type === 'paragraph' && Array.isArray(record.children)) {
      appendRuns(runs, inlineRuns(record.children as PhrasingContent[]));
    } else if (record.type !== 'list') {
      const text = plainText(node);
      if (text) pushRun(runs, { text });
    }
  }
  return runs;
}

function plainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as { value?: unknown; alt?: unknown; children?: unknown[] };
  if (typeof record.value === 'string') return record.value;
  if (typeof record.alt === 'string') return record.alt;
  if (Array.isArray(record.children)) return record.children.map(plainText).filter(Boolean).join(' ');
  return '';
}

function appendRuns(target: FeishuTextRun[], source: FeishuTextRun[]): void {
  for (const run of source) pushRun(target, run);
}

function pushRun(target: FeishuTextRun[], run: FeishuTextRun): void {
  if (!run.text) return;
  const previous = target.at(-1);
  if (previous && sameMarks(previous, run)) previous.text += run.text;
  else target.push(run);
}

function sameMarks(a: FeishuTextRun, b: FeishuTextRun): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.code === b.code && a.link === b.link;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

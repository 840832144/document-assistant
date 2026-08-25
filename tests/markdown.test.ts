import { describe, expect, it } from 'vitest';
import { markdownToFeishu } from '../src/converters/markdown-to-feishu.js';

describe('Markdown converter', () => {
  it('converts paragraph, heading, bold, and italic runs', () => {
    const converted = markdownToFeishu('# Title\n\nA **bold** and *italic* paragraph.');
    expect(converted.blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(converted.blocks[1]).toMatchObject({ type: 'paragraph' });
    const paragraph = converted.blocks[1];
    expect(paragraph && 'runs' in paragraph ? paragraph.runs : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'bold', bold: true }),
        expect.objectContaining({ text: 'italic', italic: true }),
      ]),
    );
  });

  it('converts bullet and ordered lists', () => {
    const blocks = markdownToFeishu('- one\n- two\n\n1. first\n2. second').blocks;
    expect(blocks.filter((block) => block.type === 'bullet')).toHaveLength(2);
    expect(blocks.filter((block) => block.type === 'ordered')).toHaveLength(2);
  });

  it('converts a GFM table', () => {
    const blocks = markdownToFeishu('| A | B |\n|---|---|\n| 1 | 2 |').blocks;
    const table = blocks.find((block) => block.type === 'table');
    expect(table).toBeDefined();
    expect(table && table.type === 'table' ? table.rows : []).toHaveLength(2);
  });
});

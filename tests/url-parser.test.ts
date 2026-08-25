import { describe, expect, it } from 'vitest';
import { parseDocumentId } from '../src/feishu/docs.js';

describe('document URL parser', () => {
  it('accepts a token', () => {
    expect(parseDocumentId('docx12345678')).toBe('docx12345678');
  });

  it('parses Feishu and Lark URLs', () => {
    expect(parseDocumentId('https://example.feishu.cn/docx/docx12345678')).toBe('docx12345678');
    expect(parseDocumentId('https://example.larksuite.com/docx/docxABCDEFGH')).toBe('docxABCDEFGH');
  });

  it('rejects unrelated URLs', () => {
    expect(() => parseDocumentId('https://example.com/file/abc')).toThrow();
  });
});

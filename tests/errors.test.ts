import { describe, expect, it } from 'vitest';
import { FeishuApiError, parseFeishuEnvelope, sanitizeSensitive } from '../src/feishu/errors.js';

describe('API error parsing', () => {
  it('captures API, status, code, and scope hints', () => {
    try {
      parseFeishuEnvelope('docx/v1/documents', 403, { code: 99991672, msg: 'forbidden' }, 'failed');
      throw new Error('expected error');
    } catch (error) {
      expect(error).toBeInstanceOf(FeishuApiError);
      const safe = (error as FeishuApiError).toSafeObject();
      expect(safe.api).toBe('docx/v1/documents');
      expect(safe.feishu_code).toBe(99991672);
      expect(safe.required_scopes).toContain('docx:document:readonly');
    }
  });

  it('redacts secrets and bearer tokens', () => {
    const value = sanitizeSensitive('secret-value Bearer abc.def', { appSecret: 'secret-value' });
    expect(value).not.toContain('secret-value');
    expect(value).not.toContain('abc.def');
  });
});

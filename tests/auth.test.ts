import { describe, expect, it } from 'vitest';
import { parseTokenResponse } from '../src/feishu/auth.js';

describe('token response parsing', () => {
  it('parses token and expiry', () => {
    const token = parseTokenResponse({ code: 0, tenant_access_token: 'test-token', expire: 7200 }, 1_000);
    expect(token).toEqual({ token: 'test-token', expiresAt: 7_201_000 });
  });

  it('rejects a Feishu error response', () => {
    expect(() => parseTokenResponse({ code: 10003, msg: 'invalid app' })).toThrow('invalid app');
  });
});

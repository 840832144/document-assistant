import { safeError } from '../feishu/errors.js';

export function okResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: isObject(value) ? value : { result: value },
  };
}

export function errorResult(error: unknown) {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const value = safeError(error, {
    ...(appId ? { appId } : {}),
    ...(appSecret ? { appSecret } : {}),
  });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

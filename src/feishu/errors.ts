import type { FeishuConfig } from '../config.js';

export interface FeishuEnvelope {
  code?: number;
  msg?: string;
  message?: string;
  data?: unknown;
  error?: { log_id?: string; permission_violations?: Array<{ type?: string; subject?: string }> };
}

const SCOPE_HINTS: Array<{ pattern: RegExp; scopes: string[]; consoleArea: string }> = [
  {
    pattern: /docs_ai\/v1\/documents|docx\/v1\/documents/,
    scopes: ['docx:document:create', 'docx:document:write_only', 'docx:document:readonly'],
    consoleArea: '飞书开放平台 → 应用 → 权限管理 → 云文档',
  },
  {
    pattern: /drive\/v1\/files/,
    scopes: ['drive:drive'],
    consoleArea: '飞书开放平台 → 应用 → 权限管理 → 云空间',
  },
  {
    pattern: /drive\/v[12]\/permissions/,
    scopes: ['drive:drive'],
    consoleArea: '飞书开放平台 → 应用 → 权限管理 → 云空间；企业管理员 → 云文档共享策略',
  },
];

export class FeishuApiError extends Error {
  readonly api: string;
  readonly httpStatus?: number;
  readonly feishuCode?: number;
  readonly logId?: string;
  readonly requiredScopes: string[];
  readonly consoleArea?: string;

  constructor(options: {
    api: string;
    message: string;
    httpStatus?: number;
    feishuCode?: number;
    logId?: string;
  }) {
    super(options.message);
    this.name = 'FeishuApiError';
    this.api = options.api;
    if (options.httpStatus !== undefined) this.httpStatus = options.httpStatus;
    if (options.feishuCode !== undefined) this.feishuCode = options.feishuCode;
    if (options.logId !== undefined) this.logId = options.logId;
    const hint = SCOPE_HINTS.find((item) => item.pattern.test(options.api));
    this.requiredScopes = hint?.scopes ?? [];
    if (hint) this.consoleArea = hint.consoleArea;
  }

  toSafeObject(): Record<string, unknown> {
    return {
      type: this.name,
      api: this.api,
      http_status: this.httpStatus,
      feishu_code: this.feishuCode,
      message: this.message,
      log_id: this.logId,
      required_scopes: this.requiredScopes,
      permission_console: this.consoleArea,
    };
  }
}

export function parseFeishuEnvelope(
  api: string,
  httpStatus: number,
  payload: unknown,
  fallbackMessage: string,
): FeishuEnvelope {
  const envelope = isRecord(payload) ? (payload as FeishuEnvelope) : {};
  const code = typeof envelope.code === 'number' ? envelope.code : undefined;
  if (httpStatus < 200 || httpStatus >= 300 || (code !== undefined && code !== 0)) {
    const logId = envelope.error?.log_id;
    throw new FeishuApiError({
      api,
      httpStatus,
      ...(code !== undefined ? { feishuCode: code } : {}),
      ...(logId ? { logId } : {}),
      message: envelope.msg ?? envelope.message ?? fallbackMessage,
    });
  }
  return envelope;
}

export function sanitizeSensitive(message: string, config?: Partial<FeishuConfig>): string {
  let safe = message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  for (const value of [config?.appId, config?.appSecret]) {
    if (value && value.length >= 4) safe = safe.split(value).join('[REDACTED]');
  }
  safe = safe.replace(/tenant_access_token["'\s:=]+[A-Za-z0-9._~+/=-]+/gi, 'tenant_access_token=[REDACTED]');
  safe = safe.replace(/app_secret["'\s:=]+[^\s,}]+/gi, 'app_secret=[REDACTED]');
  return safe;
}

export function safeError(error: unknown, config?: Partial<FeishuConfig>): Record<string, unknown> {
  if (error instanceof FeishuApiError) return error.toSafeObject();
  const message = error instanceof Error ? error.message : String(error);
  return { type: 'Error', message: sanitizeSensitive(message, config) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

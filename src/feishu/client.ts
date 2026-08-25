import type { FeishuConfig } from '../config.js';
import { FeishuAuth } from './auth.js';
import { FeishuApiError, parseFeishuEnvelope, sanitizeSensitive } from './errors.js';

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  auth?: boolean;
  maxRetries?: number;
}

const RETRYABLE_CODES = new Set([99991400, 99991401, 99991403, 99991420]);
const TOKEN_CODES = new Set([99991661, 99991663, 99991664, 99991668]);

export class FeishuClient {
  readonly auth: FeishuAuth;

  constructor(readonly config: FeishuConfig) {
    this.auth = new FeishuAuth(config);
  }

  async request<T>(method: string, api: string, options: RequestOptions = {}): Promise<T> {
    const retries = options.maxRetries ?? this.config.maxRetries;
    let refreshedToken = false;

    for (let attempt = 0; ; attempt += 1) {
      const url = new URL(api.replace(/^\//, ''), this.config.apiBase);
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
        if (options.auth !== false) headers.Authorization = `Bearer ${await this.auth.getToken()}`;

        const response = await fetch(url, {
          method,
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        });
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        const payload = await readJsonSafely(response);
        const code = getNumericCode(payload);

        if (!refreshedToken && code !== undefined && TOKEN_CODES.has(code)) {
          refreshedToken = true;
          this.auth.invalidate();
          await this.auth.getToken(true);
          continue;
        }

        if (
          attempt < retries &&
          (response.status === 429 || response.status >= 500 || (code !== undefined && RETRYABLE_CODES.has(code)))
        ) {
          await delay(retryAfterMs ?? backoffMs(attempt));
          continue;
        }

        const envelope = parseFeishuEnvelope(api, response.status, payload, `Feishu API request failed`);
        return envelope as T;
      } catch (error) {
        if (error instanceof FeishuApiError) throw error;
        if (attempt < retries && isRetryableNetworkError(error)) {
          await delay(backoffMs(attempt));
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new FeishuApiError({
          api,
          message: sanitizeSensitive(`Network request failed: ${message}`, this.config),
        });
      }
    }
  }
}

function getNumericCode(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const code = (payload as Record<string, unknown>).code;
  return typeof code === 'number' ? code : undefined;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - Date.now());
}

function backoffMs(attempt: number): number {
  return Math.min(8_000, 400 * 2 ** attempt) + Math.floor(Math.random() * 150);
}

function isRetryableNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { msg: `Non-JSON response (HTTP ${response.status})` };
  }
}

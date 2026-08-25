import type { FeishuConfig } from '../config.js';
import { FeishuApiError, parseFeishuEnvelope } from './errors.js';

export interface TokenResponse {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
}

export interface CachedToken {
  token: string;
  expiresAt: number;
}

export function parseTokenResponse(payload: unknown, now = Date.now()): CachedToken {
  const envelope = parseFeishuEnvelope(
    'auth/v3/tenant_access_token/internal',
    200,
    payload,
    'Unable to obtain tenant access token',
  ) as TokenResponse;
  if (!envelope.tenant_access_token || typeof envelope.expire !== 'number') {
    throw new FeishuApiError({
      api: 'auth/v3/tenant_access_token/internal',
      httpStatus: 200,
      message: 'Token response is missing tenant_access_token or expire',
    });
  }
  return {
    token: envelope.tenant_access_token,
    expiresAt: now + envelope.expire * 1000,
  };
}

export class FeishuAuth {
  private cached: CachedToken | undefined;
  private inFlight: Promise<CachedToken> | undefined;

  constructor(private readonly config: FeishuConfig) {}

  async getToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.cached && this.cached.expiresAt - 120_000 > now) {
      return this.cached.token;
    }
    if (!forceRefresh && this.inFlight) return (await this.inFlight).token;

    this.inFlight = this.fetchToken();
    try {
      this.cached = await this.inFlight;
      return this.cached.token;
    } finally {
      this.inFlight = undefined;
    }
  }

  invalidate(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<CachedToken> {
    const api = 'auth/v3/tenant_access_token/internal';
    const url = new URL(api, this.config.apiBase);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      throw new FeishuApiError({
        api,
        message: error instanceof Error ? `Token request failed: ${error.message}` : 'Token request failed',
      });
    }
    const payload = await readJsonSafely(response);
    parseFeishuEnvelope(api, response.status, payload, `Token request failed with HTTP ${response.status}`);
    return parseTokenResponse(payload);
  }
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

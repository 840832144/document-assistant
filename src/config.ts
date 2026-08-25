import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  apiBase: string;
  registryPath: string;
  requestTimeoutMs: number;
  maxRetries: number;
}

function findProjectRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(join(current, 'package.json'))) return current;
    current = dirname(current);
  }
  return process.cwd();
}

export const PROJECT_ROOT = findProjectRoot();

export function getConfigStatus(): {
  appIdPresent: boolean;
  appSecretPresent: boolean;
  apiBase: string;
  registryPath: string;
} {
  const configuredRegistry = process.env.FEISHU_DOCUMENT_REGISTRY_PATH?.trim();
  const registryPath = configuredRegistry
    ? isAbsolute(configuredRegistry)
      ? configuredRegistry
      : resolve(PROJECT_ROOT, configuredRegistry)
    : join(PROJECT_ROOT, 'data', 'document-registry.json');

  return {
    appIdPresent: Boolean(process.env.FEISHU_APP_ID?.trim()),
    appSecretPresent: Boolean(process.env.FEISHU_APP_SECRET?.trim()),
    apiBase: normalizeApiBase(process.env.FEISHU_API_BASE ?? 'https://open.feishu.cn/open-apis/'),
    registryPath,
  };
}

export function loadConfig(): FeishuConfig {
  const status = getConfigStatus();
  const appId = process.env.FEISHU_APP_ID?.trim() ?? '';
  const appSecret = process.env.FEISHU_APP_SECRET?.trim() ?? '';

  const missing = [
    !appId && 'FEISHU_APP_ID',
    !appSecret && 'FEISHU_APP_SECRET',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    appId,
    appSecret,
    apiBase: status.apiBase,
    registryPath: status.registryPath,
    requestTimeoutMs: 20_000,
    maxRetries: 3,
  };
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

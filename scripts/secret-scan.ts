import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { PROJECT_ROOT } from '../src/config.js';

const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', '.pnpm-store']);
const excludedFiles = new Set(['document-registry.json']);
const patterns: Array<{ name: string; expression: RegExp }> = [
  { name: 'hard-coded app secret', expression: /app_secret\s*[:=]\s*["'][^"'\s]{8,}["']/i },
  { name: 'hard-coded tenant token', expression: /tenant_access_token\s*[:=]\s*["'][^"'\s]{12,}["']/i },
  { name: 'Feishu app id literal', expression: /\bcli_[A-Za-z0-9]{12,}\b/ },
  { name: 'private key', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const actualValues = [process.env.FEISHU_APP_ID, process.env.FEISHU_APP_SECRET].filter(
  (value): value is string => Boolean(value && value.length >= 4),
);
const findings: Array<{ file: string; rule: string }> = [];

for (const file of await walk(PROJECT_ROOT)) {
  const content = await readFile(file, 'utf8').catch(() => '');
  for (const pattern of patterns) {
    if (pattern.expression.test(content)) findings.push({ file: relative(PROJECT_ROOT, file), rule: pattern.name });
  }
  for (const value of actualValues) {
    if (content.includes(value)) findings.push({ file: relative(PROJECT_ROOT, file), rule: 'current environment credential value' });
  }
}

if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ ok: false, findings }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, scanned_root: PROJECT_ROOT }, null, 2)}\n`);
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    if (entry.isFile() && excludedFiles.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

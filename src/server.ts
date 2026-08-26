#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { Services } from './services.js';
import { registerCreateDocumentTool } from './tools/create-document.js';
import { registerFolderTools } from './tools/folders.js';
import { registerGetDocumentTool } from './tools/get-document.js';
import { registerHealthcheckTool } from './tools/healthcheck.js';
import { registerSearchDocumentsTool } from './tools/search-documents.js';
import { registerUpdateDocumentTools } from './tools/update-document.js';

export function createServer(services = new Services()): McpServer {
  const server = new McpServer(
    { name: 'feishu-doc-mcp', version: '0.2.0' },
    {
      instructions:
        'Use search_documents before creating a document when the user refers to an earlier report. ' +
        'Prefer append_document for additions and replace_document only for full-body replacement. ' +
        'Never request or expose FEISHU_APP_SECRET or tenant tokens.',
    },
  );
  registerHealthcheckTool(server, services);
  registerCreateDocumentTool(server, services);
  registerUpdateDocumentTools(server, services);
  registerGetDocumentTool(server, services);
  registerFolderTools(server, services);
  registerSearchDocumentsTool(server, services);
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  void serveStdio(() => createServer());
}

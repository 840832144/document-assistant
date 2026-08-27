import { describe, expect, it, vi } from 'vitest';
import type { Services } from '../src/services.js';
import { createDocumentWithGovernance } from '../src/tools/create-document.js';

function servicesWithHub(registerDocument = vi.fn().mockResolvedValue({
  hub_title: 'AI Workspace｜Documentation Hub',
  hub_url: 'https://tenant.example/docx/hub',
  registered_documents: 2,
  unique_links: true,
  readback_verified: true,
})) {
  const createDocument = vi.fn().mockResolvedValue({
    document_id: 'doc-new',
    title: '新正式文档',
    url: 'https://tenant.example/docx/new',
  });
  const upsert = vi.fn().mockResolvedValue(undefined);
  const grantCompanyEdit = vi.fn().mockResolvedValue({ verified: true });
  const getDocument = vi.fn().mockResolvedValue({
    document_id: 'doc-new',
    title: '新正式文档',
    url: 'https://tenant.example/docx/new',
    plain_text: '正文',
    blocks: [],
  });
  const services = {
    registry: { upsert },
    getDocs: () => ({ createDocument, getDocument }),
    getDrive: () => ({ grantCompanyEdit }),
    getDocumentationHub: () => ({ registerDocument }),
  } as unknown as Services;
  return { services, createDocument, upsert, grantCompanyEdit, getDocument, registerDocument };
}

describe('create_document Documentation Governance', () => {
  it('enforces create, permission, document readback, Hub registration, and Hub readback result for formal documents', async () => {
    const fixture = servicesWithHub();
    const result = await createDocumentWithGovernance(fixture.services, {
      title: '新正式文档',
      markdown: '正文',
      document_kind: 'formal',
      documentation: {
        category: '📊 报告',
        description: '新建正式报告。',
        status: 'Review',
      },
    });

    expect('isError' in result ? result.isError : undefined).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      readback: { verified: true },
      documentation_hub: { status: 'registered', readback_verified: true },
    });
    expect(fixture.createDocument).toHaveBeenCalledTimes(1);
    expect(fixture.upsert).toHaveBeenCalledTimes(1);
    expect(fixture.grantCompanyEdit).toHaveBeenCalledWith('doc-new');
    expect(fixture.getDocument).toHaveBeenCalledWith('doc-new');
    expect(fixture.registerDocument).toHaveBeenCalledWith({
      documentId: 'doc-new',
      category: '📊 报告',
      description: '新建正式报告。',
      status: 'Review',
    });
    expect(fixture.createDocument.mock.invocationCallOrder[0]).toBeLessThan(fixture.getDocument.mock.invocationCallOrder[0]!);
    expect(fixture.getDocument.mock.invocationCallOrder[0]).toBeLessThan(fixture.registerDocument.mock.invocationCallOrder[0]!);
  });

  it('returns a non-retryable partial failure when mandatory Hub registration fails', async () => {
    const fixture = servicesWithHub(vi.fn().mockRejectedValue(new Error('Hub unavailable')));
    const result = await createDocumentWithGovernance(fixture.services, {
      title: '新正式文档',
      markdown: '正文',
      document_kind: 'formal',
      documentation: {
        category: '📊 报告',
        description: '新建正式报告。',
        status: 'Review',
      },
    });

    expect('isError' in result ? result.isError : undefined).toBe(true);
    expect(result.structuredContent).toMatchObject({
      type: 'PostCreateWorkflowError',
      stage: 'documentation_hub_registration',
      document_created: true,
    });
    expect((result.structuredContent as Record<string, unknown>).next_action).toContain('Do not retry create_document');
  });

  it('allows explicitly temporary documents to skip the formal Hub', async () => {
    const fixture = servicesWithHub();
    const result = await createDocumentWithGovernance(fixture.services, {
      title: '临时文档',
      markdown: '正文',
      document_kind: 'temporary',
    });

    expect('isError' in result ? result.isError : undefined).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ documentation_hub: { status: 'skipped' } });
    expect(fixture.registerDocument).not.toHaveBeenCalled();
  });
});

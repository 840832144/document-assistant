import { describe, expect, it } from 'vitest';
import {
  RECOMMENDED_READING_HEADING,
  WORKFLOW_OVERVIEW_HEADING,
  upsertDocumentationHubReadingSection,
} from '../src/project-overview-navigation.js';

describe('project overview navigation section', () => {
  it('inserts the linked reading section after the one-page overview and is idempotent', () => {
    const source = [
      '# 项目全景说明',
      '',
      '## 一页式项目说明',
      '',
      '一页式正文。',
      '',
      '## 为什么要立项',
      '',
      '后续正文。',
    ].join('\n');
    const url = 'https://tenant.example/docx/hub';

    const once = upsertDocumentationHubReadingSection(source, url);
    const twice = upsertDocumentationHubReadingSection(once, url);

    expect(twice).toBe(once);
    expect(once.indexOf('一页式正文。')).toBeLessThan(once.indexOf(RECOMMENDED_READING_HEADING));
    expect(once.indexOf(RECOMMENDED_READING_HEADING)).toBeLessThan(once.indexOf(WORKFLOW_OVERVIEW_HEADING));
    expect(once.indexOf(WORKFLOW_OVERVIEW_HEADING)).toBeLessThan(once.indexOf('## 为什么要立项'));
    expect(once).toContain(`[AI Workspace｜文档导航中心](${url})`);
    expect(once).toContain('```mermaid');
    expect(once).toContain('Collector<br/>采集');
    expect((once.match(/## 📚 下一步推荐阅读/g) ?? [])).toHaveLength(1);
    expect((once.match(/## 🗺 项目工作流总览/g) ?? [])).toHaveLength(1);
  });
});

import { markdownToFeishu } from '../src/converters/markdown-to-feishu.js';
import { DOCUMENTATION_HUB_TITLE } from '../src/documentation-hub.js';
import { upsertDocumentationHubReadingSection } from '../src/project-overview-navigation.js';
import { Services } from '../src/services.js';

const OVERVIEW_TITLE = 'Game Planner AI Workspace｜项目全景说明';
const services = new Services();
const initialized = await services.getDocumentationHub().initializeHistoricalDocuments();
const hubEntry = (await services.registry.list()).find((entry) => entry.is_documentation_hub);
if (!hubEntry || hubEntry.title !== DOCUMENTATION_HUB_TITLE) {
  throw new Error('唯一文档导航中心未能通过稳定 Registry 标记解析。');
}

const overviewMatches = (await services.registry.search({ title: OVERVIEW_TITLE })).filter(
  (entry) => entry.title === OVERVIEW_TITLE,
);
if (overviewMatches.length !== 1) throw new Error('项目全景说明必须且只能解析到一份现有文档。');
const overview = overviewMatches[0]!;
const originalMarkdown = await services.getDocs().fetchMarkdown(overview.document_id);
const updatedMarkdown = upsertDocumentationHubReadingSection(originalMarkdown, initialized.hub_url);
if (updatedMarkdown !== `${originalMarkdown.replace(/\r\n/g, '\n').trimEnd()}\n`) {
  await services.getDocs().replaceDocument(overview.document_id, markdownToFeishu(updatedMarkdown));
}

const overviewReadback = await services.getDocs().getDocument(overview.document_id);
const overviewMarkdownReadback = await services.getDocs().fetchMarkdown(overview.document_id);
const onePagePosition = overviewReadback.plain_text.indexOf('一页式项目说明');
const readingPosition = overviewReadback.plain_text.indexOf('📚 下一步推荐阅读');
const workflowPosition = overviewReadback.plain_text.indexOf('🗺 项目工作流总览');
const nextChapterPosition = overviewReadback.plain_text.indexOf('为什么要立项');
const nativeWorkflowDiagram = overviewReadback.blocks.some((block) => block.block_type === 43);
if (
  overviewReadback.title !== OVERVIEW_TITLE ||
  onePagePosition < 0 ||
  readingPosition <= onePagePosition ||
  workflowPosition <= readingPosition ||
  nextChapterPosition <= workflowPosition ||
  !nativeWorkflowDiagram ||
  !overviewMarkdownReadback.includes(`[AI Workspace｜文档导航中心](${initialized.hub_url})`)
) {
  throw new Error('项目全景说明的推荐阅读入口未通过标题、位置或链接回读。');
}

const overviewPermission = await services.getDrive().grantCompanyEdit(overview.document_id);
const hubPermission = await services.getDrive().grantCompanyEdit(hubEntry.document_id);
const registration = await services.getDocumentationHub().registerDocument({
  documentId: overview.document_id,
  category: '🏗 项目介绍',
  description: '介绍 Game Planner AI Workspace 的目标、边界、架构与协作方式。',
  status: 'Accepted',
});

process.stdout.write(
  `${JSON.stringify(
    {
      hub_title: registration.hub_title,
      hub_url: registration.hub_url,
      overview_title: overviewReadback.title,
      overview_url: registration.document_url,
      hub_same_url: registration.hub_url === initialized.hub_url,
      hub_unique: registration.unique_links,
      registered_documents: registration.registered_documents,
      overview_section_position_verified: true,
      overview_link_verified: true,
      overview_native_workflow_diagram_verified: true,
      overview_company_editable: overviewPermission.verified,
      hub_company_editable: hubPermission.verified,
      readback_verified: registration.readback_verified,
    },
    null,
    2,
  )}\n`,
);

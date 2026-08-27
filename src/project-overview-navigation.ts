export const RECOMMENDED_READING_HEADING = '## 📚 下一步推荐阅读';
export const WORKFLOW_OVERVIEW_HEADING = '## 🗺 项目工作流总览';

export function upsertDocumentationHubReadingSection(markdown: string, hubUrl: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n').trimEnd();
  const withoutReading = removeSection(normalized, RECOMMENDED_READING_HEADING);
  const withoutExisting = removeSection(withoutReading, WORKFLOW_OVERVIEW_HEADING);
  const lines = withoutExisting.split('\n');
  const overviewHeading = lines.findIndex((line) => /^##\s+一页式项目说明\s*$/.test(line.trim()));
  if (overviewHeading < 0) throw new Error('项目全景说明缺少“## 一页式项目说明”章节。');

  let insertionIndex = lines.length;
  for (let index = overviewHeading + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]!.trim())) {
      insertionIndex = index;
      break;
    }
  }

  const section = [
    RECOMMENDED_READING_HEADING,
    '',
    '如果希望继续了解 AI Workspace，请从《AI Workspace｜文档导航中心》开始。',
    '',
    '文档导航中心收录了目前所有正式文档，包括项目介绍、部署手册、游戏研究、报告、工具说明、知识库等内容。',
    '',
    `👉 点击进入：[AI Workspace｜文档导航中心](${hubUrl})`,
    '',
    WORKFLOW_OVERVIEW_HEADING,
    '',
    '下面这张图从策划视角展示：一个需求如何经过 Workspace 治理、AI 协作、游戏证据采集与分析，最终沉淀为可阅读、可评审的正式文档。',
    '',
    '```mermaid',
    'flowchart TD',
    '  A[策划提出目标] --> B[AI Workspace<br/>规则、Task、Workflow]',
    '  B --> C[ChatGPT<br/>架构、RFC、Review、策划方案]',
    '  B --> D[Codex<br/>实现、自动化、Git、测试与部署]',
    '  C --> E[游戏项目执行]',
    '  D --> E',
    '  E --> F[Collector<br/>采集]',
    '  F --> G[Evidence<br/>证据保全]',
    '  G --> H[Knowledge / Analysis<br/>知识与分析]',
    '  H --> I[Report<br/>策划报告]',
    '  I --> J[Document Assistant<br/>正式云文档]',
    '  J --> K[文档导航中心<br/>统一入口]',
    '  K --> L[策划阅读、评审与决策]',
    '```',
    '',
  ];
  lines.splice(insertionIndex, 0, ...section);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function removeSection(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return markdown;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]!.trim())) {
      end = index;
      break;
    }
  }
  lines.splice(start, end - start);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

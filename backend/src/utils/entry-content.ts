const BODY_SECTION_KEY = 'body';

export function normalizeSectionKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'section';
}

export function splitMarkdownSections(
  content: string
): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');
  let currentTitle: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0 && currentTitle === null) return;
    const text = buffer.join('\n').trim();
    if (currentTitle === null) {
      sections.push({ title: 'Body', content: text });
    } else {
      sections.push({ title: currentTitle, content: text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim();
      continue;
    }
    buffer.push(line);
  }

  flush();
  return sections.filter((section) => section.content.length > 0);
}

export function extractLogEntries(
  raw: string
): Array<{ message: string; createdAt?: Date }> {
  const entries: Array<{ message: string; createdAt?: Date }> = [];
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^[-*]\s+(\d{4}-\d{2}-\d{2}):\s*(.*)$/);
    if (match) {
      const date = new Date(match[1]);
      entries.push({
        message: match[2] || '',
        createdAt: Number.isNaN(date.getTime()) ? undefined : date
      });
    } else {
      entries.push({ message: line.replace(/^[-*]\s+/, '') });
    }
  }
  return entries;
}

export function renderContent(
  sections: Array<{ key: string; title: string; contentMarkdown: string }>,
  logs: Array<{ message: string; createdAt: Date }>
): string {
  const parts: string[] = [];
  for (const section of sections) {
    const body = section.contentMarkdown.trim();
    if (!body) continue;
    if (section.key === BODY_SECTION_KEY) {
      parts.push(body);
    } else {
      parts.push(`## ${section.title}\n\n${body}`);
    }
  }

  if (logs.length > 0) {
    const logLines = logs.map((log) => {
      const date = log.createdAt.toISOString().split('T')[0];
      return `- ${date}: ${log.message}`;
    });
    parts.push(`## Log\n\n${logLines.join('\n')}`);
  }

  return parts.join('\n\n').trim();
}

export function parseContentForStorage(content: string): {
  sections: Array<{ key: string; title: string; contentMarkdown: string }>;
  logs: Array<{ message: string; createdAt?: Date }>;
} {
  if (!content || !content.trim()) {
    return { sections: [], logs: [] };
  }

  const rawSections = splitMarkdownSections(content);
  const sections: Array<{ key: string; title: string; contentMarkdown: string }> = [];
  const logs: Array<{ message: string; createdAt?: Date }> = [];

  for (const section of rawSections) {
    if (section.title.toLowerCase() === 'log') {
      logs.push(...extractLogEntries(section.content));
      continue;
    }

    const key = section.title === 'Body' ? BODY_SECTION_KEY : normalizeSectionKey(section.title);
    sections.push({ key, title: section.title, contentMarkdown: section.content.trim() });
  }

  return { sections, logs };
}

export function applyBodyUpdateInMemory(
  existingSections: Array<{ key: string; title: string; order: number; contentMarkdown: string }>,
  update: { mode: 'replace' | 'append' | 'section'; section?: string; content: string }
): Array<{ key: string; title: string; order: number; contentMarkdown: string }> {
  if (update.mode === 'replace') {
    const parsed = parseContentForStorage(update.content);
    return parsed.sections.map((section, index) => ({
      key: section.key,
      title: section.title,
      order: index,
      contentMarkdown: section.contentMarkdown
    }));
  }

  if (update.mode === 'append') {
    if (existingSections.length === 0) {
      return [{
        key: BODY_SECTION_KEY,
        title: 'Body',
        order: 0,
        contentMarkdown: update.content
      }];
    }

    const targetIndex = existingSections.findIndex((section) => section.key === BODY_SECTION_KEY);
    const index = targetIndex >= 0 ? targetIndex : existingSections.length - 1;
    const updatedSections = [...existingSections];
    const target = updatedSections[index];
    updatedSections[index] = {
      ...target,
      contentMarkdown: `${target.contentMarkdown.trimEnd()}\n\n${update.content}`.trim()
    };
    return updatedSections;
  }

  if (update.mode === 'section') {
    if (!update.section) {
      throw new Error('Section name required for section mode');
    }

    if (update.section.toLowerCase() === 'log') {
      return existingSections;
    }

    const key = normalizeSectionKey(update.section);
    const existingIndex = existingSections.findIndex((section) => section.key === key);
    if (existingIndex >= 0) {
      const updatedSections = [...existingSections];
      const existing = updatedSections[existingIndex];
      updatedSections[existingIndex] = {
        ...existing,
        contentMarkdown: `${existing.contentMarkdown.trimEnd()}\n${update.content}`.trim()
      };
      return updatedSections;
    }

    return [
      ...existingSections,
      {
        key,
        title: update.section,
        order: existingSections.length,
        contentMarkdown: update.content
      }
    ];
  }

  return existingSections;
}

export const BODY_SECTION = BODY_SECTION_KEY;

import { Category, EntrySummary } from '../types/entry.types';
import { EntryService, getEntryService } from './entry.service';

/**
 * Index Service for generating the index content from the database.
 */
export class IndexService {
  private entryService: EntryService;
  private cachedContent: string | null = null;

  constructor(entryService?: EntryService) {
    this.entryService = entryService || getEntryService();
  }

  /**
   * Regenerate the index content (no filesystem writes).
   */
  async regenerate(): Promise<void> {
    this.cachedContent = await this.generateIndexContent();
  }

  /**
   * Get the current index content.
   */
  async getIndexContent(): Promise<string> {
    if (this.cachedContent) {
      return this.cachedContent;
    }
    return this.generateIndexContent();
  }

  private async generateIndexContent(): Promise<string> {
    const now = new Date().toISOString();
    const entries = await this.getAllEntries();

    const counts = {
      people: entries.people.length,
      projects: entries.projects.length,
      ideas: entries.ideas.length,
      admin: entries.admin.length,
      inbox: entries.inbox.length
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    let content = `# Second Brain Index\n\n> Last updated: ${now}\n> Total entries: ${total} (${counts.people} people, ${counts.projects} projects, ${counts.ideas} ideas, ${counts.admin} admin)\n\n`;

    content += this.generatePeopleSection(entries.people);
    content += this.generateProjectsSection(entries.projects);
    content += this.generateIdeasSection(entries.ideas);
    content += this.generateAdminSection(entries.admin);
    content += this.generateInboxSection(entries.inbox);

    return content;
  }

  private async getAllEntries(): Promise<Record<Category, Array<EntrySummary & { _path: string }>>> {
    const result: Record<Category, Array<EntrySummary & { _path: string }>> = {
      people: [],
      projects: [],
      ideas: [],
      admin: [],
      inbox: []
    };

    const entries = await this.entryService.list();
    for (const entry of entries) {
      result[entry.category].push({ ...entry, _path: entry.path });
    }

    return result;
  }

  private generatePeopleSection(entries: Array<EntrySummary & { _path: string }>): string {
    if (entries.length === 0) return '';

    let section = `## People (${entries.length})\n\n| Name | Context | Last Touched |\n| --- | --- | --- |\n`;

    for (const entry of entries) {
      const name = `[${entry.name}](${entry._path})`;
      const context = (entry.context || '').substring(0, 50);
      const lastTouched = entry.last_touched || '';
      section += `| ${name} | ${context} | ${lastTouched} |\n`;
    }

    return section + '\n';
  }

  private generateProjectsSection(entries: Array<EntrySummary & { _path: string }>): string {
    if (entries.length === 0) return '';

    const active = entries.filter((entry) => entry.status === 'active');
    const waiting = entries.filter((entry) => ['waiting', 'blocked'].includes(entry.status || ''));
    const someday = entries.filter((entry) => entry.status === 'someday');

    let section = '';

    if (active.length > 0) {
      section += `## Projects – Active (${active.length})\n\n| Project | Next Action | Status |\n| --- | --- | --- |\n`;
      for (const entry of active) {
        const name = `[${entry.name}](${entry._path})`;
        const nextAction = (entry.next_action || '').substring(0, 40);
        section += `| ${name} | ${nextAction} | ${entry.status} |\n`;
      }
      section += '\n';
    }

    if (waiting.length > 0) {
      section += `## Projects – Waiting (${waiting.length})\n\n| Project | Waiting On | Status |\n| --- | --- | --- |\n`;
      for (const entry of waiting) {
        const name = `[${entry.name}](${entry._path})`;
        const waitingOn = (entry.next_action || '').substring(0, 40);
        section += `| ${name} | ${waitingOn} | ${entry.status} |\n`;
      }
      section += '\n';
    }

    if (someday.length > 0) {
      section += `## Projects – Someday (${someday.length})\n\n| Project | Next Action | Status |\n| --- | --- | --- |\n`;
      for (const entry of someday) {
        const name = `[${entry.name}](${entry._path})`;
        const nextAction = (entry.next_action || '').substring(0, 40);
        section += `| ${name} | ${nextAction} | ${entry.status} |\n`;
      }
      section += '\n';
    }

    return section;
  }

  private generateIdeasSection(entries: Array<EntrySummary & { _path: string }>): string {
    if (entries.length === 0) return '';

    let section = `## Ideas (${entries.length})\n\n| Idea | One-liner |\n| --- | --- |\n`;

    for (const entry of entries) {
      const name = `[${entry.name}](${entry._path})`;
      const oneLiner = (entry.one_liner || '').substring(0, 60);
      section += `| ${name} | ${oneLiner} |\n`;
    }

    return section + '\n';
  }

  private generateAdminSection(entries: Array<EntrySummary & { _path: string }>): string {
    if (entries.length === 0) return '';

    const pending = entries.filter((entry) => entry.status === 'pending');

    pending.sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    let section = `## Admin – Pending (${pending.length})\n\n| Task | Due |\n| --- | --- |\n`;

    for (const entry of pending) {
      const name = `[${entry.name}](${entry._path})`;
      const due = entry.due_date || '';
      section += `| ${name} | ${due} |\n`;
    }

    return section + '\n';
  }

  private generateInboxSection(entries: Array<EntrySummary & { _path: string }>): string {
    if (entries.length === 0) return '';

    const needsReview = entries.filter((entry) => entry.status === 'needs_review');
    if (needsReview.length === 0) return '';

    let section = `## Inbox – Needs Review (${needsReview.length})\n\n| Captured | Original Text | Suggested |\n| --- | --- | --- |\n`;

    for (const entry of needsReview) {
      const captured = `[${entry.name}](${entry._path})`;
      const originalText = (entry.original_text || '').substring(0, 40);
      const suggested = entry.suggested_category || '';
      section += `| ${captured} | "${originalText}..." | ${suggested} |\n`;
    }

    return section + '\n';
  }
}

let indexServiceInstance: IndexService | null = null;

export function getIndexService(): IndexService {
  if (!indexServiceInstance) {
    indexServiceInstance = new IndexService();
  }
  return indexServiceInstance;
}

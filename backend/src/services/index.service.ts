import matter from 'gray-matter';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { getConfig } from '../config/env';
import { Category } from '../types/entry.types';

/**
 * Index Service for generating and managing the index.md file
 */
export class IndexService {
  private dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || getConfig().DATA_PATH;
  }

  /**
   * Regenerate the index.md file
   */
  async regenerate(): Promise<void> {
    const content = await this.generateIndexContent();
    const indexPath = join(this.dataPath, 'index.md');
    await writeFile(indexPath, content, 'utf-8');
  }

  /**
   * Get the current index.md content
   */
  async getIndexContent(): Promise<string> {
    try {
      const indexPath = join(this.dataPath, 'index.md');
      return await readFile(indexPath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Generate the full index content
   */
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

    let content = `# Second Brain Index

> Last updated: ${now}
> Total entries: ${total} (${counts.people} people, ${counts.projects} projects, ${counts.ideas} ideas, ${counts.admin} admin)

`;

    // People section
    content += this.generatePeopleSection(entries.people);
    
    // Projects sections
    content += this.generateProjectsSection(entries.projects);
    
    // Ideas section
    content += this.generateIdeasSection(entries.ideas);
    
    // Admin section
    content += this.generateAdminSection(entries.admin);
    
    // Inbox section
    content += this.generateInboxSection(entries.inbox);

    return content;
  }

  /**
   * Get all entries organized by category
   */
  private async getAllEntries(): Promise<Record<Category, any[]>> {
    const result: Record<Category, any[]> = {
      people: [],
      projects: [],
      ideas: [],
      admin: [],
      inbox: []
    };

    for (const category of Object.keys(result) as Category[]) {
      const categoryPath = join(this.dataPath, category);
      try {
        const files = await readdir(categoryPath);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          try {
            const filePath = join(categoryPath, file);
            const fileContent = await readFile(filePath, 'utf-8');
            const { data } = matter(fileContent);
            result[category].push({
              ...data,
              _path: `${category}/${file}`
            });
          } catch {
            // Skip files that can't be read
          }
        }
      } catch {
        // Category folder might not exist
      }
    }

    return result;
  }

  /**
   * Generate People section
   */
  private generatePeopleSection(entries: any[]): string {
    if (entries.length === 0) {
      return `## People (0)

No people entries yet.

`;
    }

    // Sort by last_touched descending
    entries.sort((a, b) => 
      new Date(b.last_touched || b.updated_at).getTime() - 
      new Date(a.last_touched || a.updated_at).getTime()
    );

    let section = `## People (${entries.length})

| Name | Context | Last Touched |
|------|---------|--------------|
`;

    for (const entry of entries) {
      const name = `[${entry.name}](${entry._path})`;
      const context = (entry.context || '').substring(0, 50);
      const lastTouched = entry.last_touched || entry.updated_at?.split('T')[0] || '';
      section += `| ${name} | ${context} | ${lastTouched} |\n`;
    }

    return section + '\n';
  }

  /**
   * Generate Projects section (active and waiting/blocked)
   */
  private generateProjectsSection(entries: any[]): string {
    const active = entries.filter(e => e.status === 'active');
    const waiting = entries.filter(e => ['waiting', 'blocked'].includes(e.status));
    const someday = entries.filter(e => e.status === 'someday');
    
    let section = '';

    // Active projects
    section += `## Projects – Active (${active.length})

`;
    if (active.length === 0) {
      section += `No active projects.

`;
    } else {
      section += `| Project | Next Action | Status |
|---------|-------------|--------|
`;
      for (const entry of active) {
        const name = `[${entry.name}](${entry._path})`;
        const nextAction = (entry.next_action || '').substring(0, 40);
        section += `| ${name} | ${nextAction} | ${entry.status} |\n`;
      }
      section += '\n';
    }

    // Waiting/Blocked projects
    section += `## Projects – Waiting/Blocked (${waiting.length})

`;
    if (waiting.length === 0) {
      section += `No waiting or blocked projects.

`;
    } else {
      section += `| Project | Waiting On | Since |
|---------|------------|-------|
`;
      for (const entry of waiting) {
        const name = `[${entry.name}](${entry._path})`;
        const waitingOn = (entry.next_action || '').substring(0, 40);
        const since = entry.updated_at?.split('T')[0] || '';
        section += `| ${name} | ${waitingOn} | ${since} |\n`;
      }
      section += '\n';
    }

    return section;
  }

  /**
   * Generate Ideas section
   */
  private generateIdeasSection(entries: any[]): string {
    if (entries.length === 0) {
      return `## Ideas (0)

No ideas yet.

`;
    }

    // Sort by created_at descending
    entries.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    let section = `## Ideas (${entries.length})

| Idea | One-liner |
|------|-----------|
`;

    for (const entry of entries) {
      const name = `[${entry.name}](${entry._path})`;
      const oneLiner = (entry.one_liner || '').substring(0, 60);
      section += `| ${name} | ${oneLiner} |\n`;
    }

    return section + '\n';
  }

  /**
   * Generate Admin section (pending tasks)
   */
  private generateAdminSection(entries: any[]): string {
    const pending = entries.filter(e => e.status === 'pending');
    
    if (pending.length === 0) {
      return `## Admin – Pending (0)

No pending admin tasks.

`;
    }

    // Sort by due_date ascending (earliest first)
    pending.sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    let section = `## Admin – Pending (${pending.length})

| Task | Due |
|------|-----|
`;

    for (const entry of pending) {
      const name = `[${entry.name}](${entry._path})`;
      const due = entry.due_date || '';
      section += `| ${name} | ${due} |\n`;
    }

    return section + '\n';
  }

  /**
   * Generate Inbox section (needs review)
   */
  private generateInboxSection(entries: any[]): string {
    const needsReview = entries.filter(e => e.status === 'needs_review');
    
    if (needsReview.length === 0) {
      return `## Inbox – Needs Review (0)

No items in inbox.

`;
    }

    // Sort by created_at descending (newest first)
    needsReview.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    let section = `## Inbox – Needs Review (${needsReview.length})

| Captured | Original Text | Suggested |
|----------|---------------|-----------|
`;

    for (const entry of needsReview) {
      const captured = entry.created_at?.split('T')[0] || '';
      const originalText = (entry.original_text || '').substring(0, 40);
      const suggested = entry.suggested_category || '';
      section += `| ${captured} | "${originalText}..." | ${suggested} |\n`;
    }

    return section + '\n';
  }
}

// Export singleton instance
let indexServiceInstance: IndexService | null = null;

export function getIndexService(dataPath?: string): IndexService {
  if (!indexServiceInstance || dataPath) {
    indexServiceInstance = new IndexService(dataPath);
  }
  return indexServiceInstance;
}

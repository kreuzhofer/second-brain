import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';
import { getPrismaClient } from '../lib/prisma';
import { EntryService } from '../services/entry.service';
import { UserService } from '../services/user.service';
import { MemoryType } from '../types/entry.types';

const AGENT_ID = 'claude-code';
const AGENT_NAME = 'Claude Code';

function mapMemoryType(frontmatterType?: string): MemoryType {
  const mapping: Record<string, MemoryType> = {
    user: 'fact',
    feedback: 'feedback',
    project: 'context',
    reference: 'context',
    fact: 'fact',
    preference: 'preference',
    context: 'context',
    relationship: 'relationship'
  };
  return mapping[frontmatterType || ''] || 'context';
}

function findMemoryFiles(basePath: string): string[] {
  const files: string[] = [];
  const projectsDir = join(basePath, 'projects');

  if (!existsSync(projectsDir)) return files;

  for (const project of readdirSync(projectsDir)) {
    const memoryDir = join(projectsDir, project, 'memory');
    if (!existsSync(memoryDir) || !statSync(memoryDir).isDirectory()) continue;

    for (const file of readdirSync(memoryDir)) {
      if (file.endsWith('.md') && file !== 'MEMORY.md') {
        files.push(join(memoryDir, file));
      }
    }
  }

  return files;
}

async function main(): Promise<void> {
  const importPath = process.env.MEMORY_IMPORT_PATH || join(process.env.HOME || '~', '.claude');
  const dryRun = process.argv.includes('--dry-run');

  if (!existsSync(importPath)) {
    console.error(`Import path does not exist: ${importPath}`);
    process.exit(1);
  }

  console.log(`Importing Claude Code memories from: ${importPath}`);
  if (dryRun) console.log('(dry run — no changes will be made)');

  const prisma = getPrismaClient();
  await prisma.$connect();

  const userService = new UserService();
  await userService.ensureDefaultUser();

  const entryService = new EntryService();

  const files = findMemoryFiles(importPath);
  console.log(`Found ${files.length} memory files`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of files) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const { data: frontmatter, content } = matter(raw);

      const title = frontmatter.name || basename(filePath, '.md').replace(/-/g, ' ');
      const memoryType = mapMemoryType(frontmatter.type);
      const body = content.trim();

      if (!body) {
        skipped++;
        continue;
      }

      // Check for duplicate by title
      try {
        await entryService.read(`memory/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50)}`);
        console.log(`  Skipping (exists): ${title}`);
        skipped++;
        continue;
      } catch {
        // Entry doesn't exist — good, create it
      }

      if (dryRun) {
        console.log(`  Would import: ${title} [${memoryType}]`);
        imported++;
        continue;
      }

      await entryService.create(
        'memory',
        {
          name: title,
          agent_id: AGENT_ID,
          agent_name: AGENT_NAME,
          memory_type: memoryType,
          confidence: 1.0,
          tags: frontmatter.type ? [frontmatter.type] : [],
          source_channel: 'api'
        },
        'api',
        body
      );

      console.log(`  Imported: ${title} [${memoryType}]`);
      imported++;
    } catch (error: any) {
      errors++;
      console.error(`  Failed: ${filePath} — ${error.message}`);
    }
  }

  console.log(`\nDone. Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });

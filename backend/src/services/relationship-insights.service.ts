import { getPrismaClient } from '../lib/prisma';
import {
  EntryLinkSummary,
  RelationshipInsight
} from '../types/entry.types';
import { requireUserId } from '../context/user-context';

type Category = 'people' | 'projects' | 'ideas' | 'admin' | 'inbox';

interface PersonStats {
  person: EntryLinkSummary;
  relatedPeople: Map<string, { summary: EntryLinkSummary; count: number }>;
  relatedProjects: Map<string, { summary: EntryLinkSummary; count: number }>;
  mentionCount: number;
  lastInteractionAt?: string;
}

function buildPath(category: string, slug: string): string {
  return `${category}/${slug}`;
}

function toSummary(entry: { category: string; slug: string; title: string }): EntryLinkSummary {
  return {
    path: buildPath(entry.category, entry.slug),
    category: entry.category as Category,
    name: entry.title
  };
}

function bumpCounter(
  map: Map<string, { summary: EntryLinkSummary; count: number }>,
  summary: EntryLinkSummary
): void {
  const existing = map.get(summary.path);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(summary.path, { summary, count: 1 });
}

function toTopSummaries(
  map: Map<string, { summary: EntryLinkSummary; count: number }>,
  limit = 3
): Array<EntryLinkSummary & { count: number }> {
  return Array.from(map.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.summary.name.localeCompare(b.summary.name);
    })
    .slice(0, limit)
    .map((item) => ({ ...item.summary, count: item.count }));
}

export class RelationshipInsightsService {
  private prisma = getPrismaClient();

  async listTopPeople(limit = 5): Promise<RelationshipInsight[]> {
    const userId = requireUserId();
    const links = await this.prisma.entryLink.findMany({
      where: {
        userId,
        OR: [
          { sourceEntry: { category: 'people' } },
          { targetEntry: { category: 'people' } }
        ]
      },
      include: {
        sourceEntry: {
          select: {
            category: true,
            slug: true,
            title: true
          }
        },
        targetEntry: {
          select: {
            category: true,
            slug: true,
            title: true
          }
        }
      }
    });

    const statsByPath = new Map<string, PersonStats>();

    const ensurePerson = (entry: { category: string; slug: string; title: string }, seenAt: string): PersonStats => {
      const summary = toSummary(entry);
      const existing = statsByPath.get(summary.path);
      if (existing) {
        if (!existing.lastInteractionAt || seenAt > existing.lastInteractionAt) {
          existing.lastInteractionAt = seenAt;
        }
        return existing;
      }
      const created: PersonStats = {
        person: summary,
        relatedPeople: new Map(),
        relatedProjects: new Map(),
        mentionCount: 0,
        lastInteractionAt: seenAt
      };
      statsByPath.set(summary.path, created);
      return created;
    };

    for (const link of links) {
      const source = link.sourceEntry;
      const target = link.targetEntry;
      const seenAt = link.createdAt.toISOString();

      const sourceIsPerson = source.category === 'people';
      const targetIsPerson = target.category === 'people';
      const sourceIsProject = source.category === 'projects';
      const targetIsProject = target.category === 'projects';

      const sourcePersonStats = sourceIsPerson ? ensurePerson(source, seenAt) : null;
      const targetPersonStats = targetIsPerson ? ensurePerson(target, seenAt) : null;

      if (link.type === 'relationship' && sourcePersonStats && targetPersonStats) {
        bumpCounter(sourcePersonStats.relatedPeople, targetPersonStats.person);
        bumpCounter(targetPersonStats.relatedPeople, sourcePersonStats.person);
      }

      if (link.type === 'mention') {
        if (sourcePersonStats && targetIsProject) {
          bumpCounter(sourcePersonStats.relatedProjects, toSummary(target));
        }

        if (targetPersonStats && sourceIsProject) {
          bumpCounter(targetPersonStats.relatedProjects, toSummary(source));
        }

        if (targetPersonStats && source.category !== 'people') {
          targetPersonStats.mentionCount += 1;
        }
      }
    }

    return Array.from(statsByPath.values())
      .map((stats) => {
        const relationshipCount = stats.relatedPeople.size;
        const projectCount = stats.relatedProjects.size;
        const score = (relationshipCount * 3) + (projectCount * 2) + stats.mentionCount;
        return {
          person: stats.person,
          score,
          relationshipCount,
          projectCount,
          mentionCount: stats.mentionCount,
          relatedPeople: toTopSummaries(stats.relatedPeople),
          relatedProjects: toTopSummaries(stats.relatedProjects),
          lastInteractionAt: stats.lastInteractionAt
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.relationshipCount !== a.relationshipCount) return b.relationshipCount - a.relationshipCount;
        return (b.lastInteractionAt ?? '').localeCompare(a.lastInteractionAt ?? '');
      })
      .slice(0, limit);
  }
}

let relationshipInsightsService: RelationshipInsightsService | null = null;

export function getRelationshipInsightsService(): RelationshipInsightsService {
  if (!relationshipInsightsService) {
    relationshipInsightsService = new RelationshipInsightsService();
  }
  return relationshipInsightsService;
}

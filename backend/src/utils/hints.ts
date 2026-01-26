/**
 * Hint Parsing Utility
 * Parses category hints and entity links from user messages.
 * 
 * Requirements 10.1: Parse [project], [person], [idea], [task] hints
 * Requirements 10.2: Parse [person:name] format for entity linking
 */

import { Category } from './fields';

/**
 * Parsed hint result
 */
export interface ParsedHints {
  /** Suggested category from hint (if any) */
  category?: Category;
  /** Entity links extracted from hints (e.g., person names) */
  entityLinks: EntityLink[];
  /** The original message with hints removed */
  cleanedMessage: string;
  /** Raw hint strings found */
  rawHints: string[];
}

/**
 * Entity link extracted from a hint
 */
export interface EntityLink {
  type: 'person' | 'project' | 'idea' | 'task';
  name?: string;
}

/**
 * Mapping from hint keywords to categories
 */
const HINT_TO_CATEGORY: Record<string, Category> = {
  'project': 'projects',
  'projects': 'projects',
  'person': 'people',
  'people': 'people',
  'idea': 'ideas',
  'ideas': 'ideas',
  'task': 'admin',
  'admin': 'admin',
};

/**
 * Mapping from hint keywords to entity types
 */
const HINT_TO_ENTITY_TYPE: Record<string, EntityLink['type']> = {
  'project': 'project',
  'projects': 'project',
  'person': 'person',
  'people': 'person',
  'idea': 'idea',
  'ideas': 'idea',
  'task': 'task',
  'admin': 'task',
};

/**
 * Regex pattern for matching hints in square brackets.
 * Matches:
 * - [project], [person], [idea], [task], etc.
 * - [person:John Doe], [project:My Project], etc.
 */
const HINT_PATTERN = /\[([a-zA-Z]+)(?::([^\]]+))?\]/g;

/**
 * Parse hints from a user message.
 * 
 * Extracts category hints and entity links from square bracket notation.
 * 
 * @param message - The user message to parse
 * @returns ParsedHints object with extracted information
 */
export function parseHints(message: string): ParsedHints {
  const result: ParsedHints = {
    entityLinks: [],
    cleanedMessage: message,
    rawHints: [],
  };

  if (!message || typeof message !== 'string') {
    return result;
  }

  const matches: Array<{ full: string; type: string; name?: string }> = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  HINT_PATTERN.lastIndex = 0;

  while ((match = HINT_PATTERN.exec(message)) !== null) {
    const [fullMatch, hintType, hintName] = match;
    matches.push({
      full: fullMatch,
      type: hintType.toLowerCase(),
      name: hintName?.trim(),
    });
    result.rawHints.push(fullMatch);
  }

  // Process matches
  for (const m of matches) {
    // Check if this is a valid hint type
    if (HINT_TO_CATEGORY[m.type]) {
      // Set category (last hint wins if multiple)
      result.category = HINT_TO_CATEGORY[m.type];

      // Add entity link
      const entityType = HINT_TO_ENTITY_TYPE[m.type];
      if (entityType) {
        result.entityLinks.push({
          type: entityType,
          name: m.name,
        });
      }
    }
  }

  // Remove hints from message
  result.cleanedMessage = message
    .replace(HINT_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

/**
 * Format hints for passing to the classification agent.
 * 
 * @param parsedHints - The parsed hints object
 * @returns Formatted hint string for the classifier
 */
export function formatHintsForClassifier(parsedHints: ParsedHints): string {
  const parts: string[] = [];

  if (parsedHints.category) {
    parts.push(`Category hint: ${parsedHints.category}`);
  }

  for (const link of parsedHints.entityLinks) {
    if (link.name) {
      parts.push(`${link.type} reference: ${link.name}`);
    }
  }

  return parts.join('; ');
}

/**
 * Check if a message contains any hints.
 * 
 * @param message - The message to check
 * @returns True if the message contains hints
 */
export function hasHints(message: string): boolean {
  if (!message || typeof message !== 'string') {
    return false;
  }
  HINT_PATTERN.lastIndex = 0;
  return HINT_PATTERN.test(message);
}

/**
 * Extract just the category hint from a message (if any).
 * 
 * @param message - The message to parse
 * @returns The hinted category or undefined
 */
export function extractCategoryHint(message: string): Category | undefined {
  const parsed = parseHints(message);
  return parsed.category;
}

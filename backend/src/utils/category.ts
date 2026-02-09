import { Category } from '../types/entry.types';

export const LEGACY_TASK_CATEGORY = 'admin';
export const CANONICAL_TASK_CATEGORY = 'task';

export function isTaskCategory(category: string): boolean {
  return category === CANONICAL_TASK_CATEGORY || category === LEGACY_TASK_CATEGORY;
}

export function toCanonicalCategory(category: string): Category {
  if (category === LEGACY_TASK_CATEGORY) {
    return CANONICAL_TASK_CATEGORY;
  }
  return category as Category;
}

export function toStorageCategory(category: Category | string): Category {
  if (category === LEGACY_TASK_CATEGORY) {
    return CANONICAL_TASK_CATEGORY;
  }
  return category as Category;
}

export function toLegacyCompatibleCategories(category?: Category | string): Category[] {
  if (!category) return [];
  if (isTaskCategory(category)) {
    return [CANONICAL_TASK_CATEGORY, LEGACY_TASK_CATEGORY] as Category[];
  }
  return [category as Category];
}

export function isValidCategory(category: string, includeInbox = true): boolean {
  const valid = includeInbox
    ? ['people', 'projects', 'ideas', 'task', 'admin', 'inbox']
    : ['people', 'projects', 'ideas', 'task', 'admin'];
  return valid.includes(category);
}

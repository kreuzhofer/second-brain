/**
 * Category-Specific Field Extraction Utility
 * Extracts and validates fields based on classified category.
 * 
 * Requirements 3.6: Extract category-specific fields from classification
 */

import {
  CategoryFields,
  PeopleFields,
  ProjectsFields,
  IdeasFields,
  AdminFields,
} from '../types/chat.types';

/**
 * Category type for classification
 */
export type Category = 'people' | 'projects' | 'ideas' | 'admin';

/**
 * Default values for people category fields
 */
const DEFAULT_PEOPLE_FIELDS: PeopleFields = {
  context: '',
  followUps: [],
  relatedProjects: [],
};

/**
 * Default values for projects category fields
 */
const DEFAULT_PROJECTS_FIELDS: ProjectsFields = {
  status: 'active',
  nextAction: '',
  relatedPeople: [],
};

/**
 * Default values for ideas category fields
 */
const DEFAULT_IDEAS_FIELDS: IdeasFields = {
  oneLiner: '',
  relatedProjects: [],
};

/**
 * Default values for admin category fields
 */
const DEFAULT_ADMIN_FIELDS: AdminFields = {
  status: 'pending',
};

/**
 * Valid project statuses
 */
const VALID_PROJECT_STATUSES = ['active', 'waiting', 'blocked', 'someday'] as const;

/**
 * Extract and validate category-specific fields from raw input.
 * Applies defaults for missing optional fields.
 * 
 * @param category - The classified category
 * @param rawFields - Raw fields object from classification
 * @returns Validated and normalized CategoryFields
 */
export function extractCategoryFields(
  category: Category,
  rawFields: Record<string, unknown> = {}
): CategoryFields {
  switch (category) {
    case 'people':
      return extractPeopleFields(rawFields);
    case 'projects':
      return extractProjectsFields(rawFields);
    case 'ideas':
      return extractIdeasFields(rawFields);
    case 'admin':
      return extractAdminFields(rawFields);
    default:
      // Fallback to admin fields for unknown categories
      return extractAdminFields(rawFields);
  }
}

/**
 * Extract people category fields.
 */
export function extractPeopleFields(rawFields: Record<string, unknown>): PeopleFields {
  return {
    context: normalizeString(rawFields.context) || DEFAULT_PEOPLE_FIELDS.context,
    followUps: normalizeStringArray(rawFields.followUps || rawFields.follow_ups),
    relatedProjects: normalizeStringArray(
      rawFields.relatedProjects || rawFields.related_projects
    ),
  };
}

/**
 * Extract projects category fields.
 */
export function extractProjectsFields(rawFields: Record<string, unknown>): ProjectsFields {
  const status = normalizeString(rawFields.status);
  const validStatus = VALID_PROJECT_STATUSES.includes(status as typeof VALID_PROJECT_STATUSES[number])
    ? (status as ProjectsFields['status'])
    : DEFAULT_PROJECTS_FIELDS.status;

  const result: ProjectsFields = {
    status: validStatus,
    nextAction: normalizeString(rawFields.nextAction || rawFields.next_action) || 
      DEFAULT_PROJECTS_FIELDS.nextAction,
    relatedPeople: normalizeStringArray(
      rawFields.relatedPeople || rawFields.related_people
    ),
  };

  // Add optional dueDate if present
  const dueDate = normalizeString(rawFields.dueDate || rawFields.due_date);
  if (dueDate) {
    result.dueDate = dueDate;
  }

  return result;
}

/**
 * Extract ideas category fields.
 */
export function extractIdeasFields(rawFields: Record<string, unknown>): IdeasFields {
  return {
    oneLiner: normalizeString(rawFields.oneLiner || rawFields.one_liner) || 
      DEFAULT_IDEAS_FIELDS.oneLiner,
    relatedProjects: normalizeStringArray(
      rawFields.relatedProjects || rawFields.related_projects
    ),
  };
}

/**
 * Extract admin category fields.
 */
export function extractAdminFields(rawFields: Record<string, unknown>): AdminFields {
  const result: AdminFields = {
    status: 'pending',
  };

  // Add optional dueDate if present
  const dueDate = normalizeString(rawFields.dueDate || rawFields.due_date);
  if (dueDate) {
    result.dueDate = dueDate;
  }

  return result;
}

/**
 * Validate that fields match the expected structure for a category.
 * 
 * @param category - The category to validate against
 * @param fields - The fields to validate
 * @returns True if fields match the category schema
 */
export function validateCategoryFields(
  category: Category,
  fields: CategoryFields
): boolean {
  switch (category) {
    case 'people':
      return isPeopleFields(fields);
    case 'projects':
      return isProjectsFields(fields);
    case 'ideas':
      return isIdeasFields(fields);
    case 'admin':
      return isAdminFields(fields);
    default:
      return false;
  }
}

/**
 * Type guard for PeopleFields
 */
export function isPeopleFields(fields: CategoryFields): fields is PeopleFields {
  const f = fields as PeopleFields;
  return (
    typeof f.context === 'string' &&
    Array.isArray(f.followUps) &&
    Array.isArray(f.relatedProjects)
  );
}

/**
 * Type guard for ProjectsFields
 */
export function isProjectsFields(fields: CategoryFields): fields is ProjectsFields {
  const f = fields as ProjectsFields;
  return (
    VALID_PROJECT_STATUSES.includes(f.status) &&
    typeof f.nextAction === 'string' &&
    Array.isArray(f.relatedPeople)
  );
}

/**
 * Type guard for IdeasFields
 */
export function isIdeasFields(fields: CategoryFields): fields is IdeasFields {
  const f = fields as IdeasFields;
  return (
    typeof f.oneLiner === 'string' &&
    Array.isArray(f.relatedProjects)
  );
}

/**
 * Type guard for AdminFields
 */
export function isAdminFields(fields: CategoryFields): fields is AdminFields {
  const f = fields as AdminFields;
  return f.status === 'pending';
}

/**
 * Get the required field keys for a category.
 */
export function getRequiredFieldKeys(category: Category): string[] {
  switch (category) {
    case 'people':
      return ['context', 'followUps', 'relatedProjects'];
    case 'projects':
      return ['status', 'nextAction', 'relatedPeople'];
    case 'ideas':
      return ['oneLiner', 'relatedProjects'];
    case 'admin':
      return ['status'];
    default:
      return [];
  }
}

/**
 * Get the optional field keys for a category.
 */
export function getOptionalFieldKeys(category: Category): string[] {
  switch (category) {
    case 'people':
      return [];
    case 'projects':
      return ['dueDate'];
    case 'ideas':
      return [];
    case 'admin':
      return ['dueDate'];
    default:
      return [];
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Normalize a value to a string.
 */
function normalizeString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/**
 * Normalize a value to a string array.
 */
function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string').map(String);
  }
  return [];
}

/**
 * Slug Generation Utility
 * Generates URL-safe slugs from arbitrary strings.
 * 
 * Requirements 3.5: Generate URL-safe slugs for entry filenames
 */

/**
 * Generate a URL-safe slug from a name string.
 * 
 * Rules:
 * - Only lowercase letters, numbers, and hyphens
 * - No leading or trailing hyphens
 * - No consecutive hyphens
 * - Max length enforced (default 50 characters)
 * - Unicode characters are transliterated or removed
 * 
 * @param name - The input string to convert to a slug
 * @param maxLength - Maximum length of the resulting slug (default 50)
 * @returns URL-safe slug string
 */
export function generateSlug(name: string, maxLength: number = 50): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let slug = name
    // Convert to lowercase
    .toLowerCase()
    // Normalize unicode characters (NFD decomposition)
    .normalize('NFD')
    // Remove diacritical marks (accents)
    .replace(/[\u0300-\u036f]/g, '')
    // Replace common unicode characters with ASCII equivalents
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove any character that isn't a-z, 0-9, or hyphen
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple consecutive hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading hyphens
    .replace(/^-+/, '')
    // Remove trailing hyphens
    .replace(/-+$/, '');

  // Enforce max length, but don't cut in the middle of a word if possible
  if (slug.length > maxLength) {
    slug = slug.substring(0, maxLength);
    // Remove trailing hyphen if we cut at a word boundary
    slug = slug.replace(/-+$/, '');
  }

  return slug;
}

/**
 * Generate a unique slug by appending a numeric suffix if needed.
 * 
 * @param baseName - The input string to convert to a slug
 * @param existingSlugs - Set of existing slugs to check against
 * @param maxLength - Maximum length of the resulting slug (default 50)
 * @returns Unique URL-safe slug string
 */
export function generateUniqueSlug(
  baseName: string,
  existingSlugs: Set<string>,
  maxLength: number = 50
): string {
  const baseSlug = generateSlug(baseName, maxLength);
  
  if (!baseSlug) {
    // If base slug is empty, generate a fallback
    let counter = 1;
    while (existingSlugs.has(`entry-${counter}`)) {
      counter++;
    }
    return `entry-${counter}`;
  }

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  // Find a unique suffix
  let counter = 2;
  let uniqueSlug = `${baseSlug}-${counter}`;
  
  // Account for suffix length in max length calculation
  const maxBaseLength = maxLength - 4; // Reserve space for "-999"
  const truncatedBase = baseSlug.length > maxBaseLength 
    ? baseSlug.substring(0, maxBaseLength).replace(/-+$/, '')
    : baseSlug;

  while (existingSlugs.has(uniqueSlug)) {
    counter++;
    uniqueSlug = `${truncatedBase}-${counter}`;
  }

  return uniqueSlug;
}

/**
 * Property-Based Tests for Slug Generation
 * 
 * Feature: chat-capture-and-classification
 * Property 2: Slug URL-Safety
 * 
 * **Validates: Requirements 3.5**
 */

import * as fc from 'fast-check';
import { generateSlug, generateUniqueSlug } from '../../src/utils/slug';

describe('Slug Generation - Property Tests', () => {
  /**
   * Property 2: Slug URL-Safety
   * 
   * For any name string provided to the slug generator, the resulting slug
   * SHALL contain only lowercase letters, numbers, and hyphens, with no
   * leading or trailing hyphens, and no consecutive hyphens.
   * 
   * **Validates: Requirements 3.5**
   */
  describe('Property 2: Slug URL-Safety', () => {
    it('produces URL-safe slugs containing only lowercase letters, numbers, and hyphens', () => {
      fc.assert(
        fc.property(fc.string(), (name) => {
          const slug = generateSlug(name);
          // Only lowercase letters, numbers, hyphens allowed
          expect(slug).toMatch(/^[a-z0-9-]*$/);
        }),
        { numRuns: 100 }
      );
    });

    it('produces slugs with no leading hyphens', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (name) => {
          const slug = generateSlug(name);
          if (slug.length > 0) {
            expect(slug[0]).not.toBe('-');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('produces slugs with no trailing hyphens', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (name) => {
          const slug = generateSlug(name);
          if (slug.length > 0) {
            expect(slug[slug.length - 1]).not.toBe('-');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('produces slugs with no consecutive hyphens', () => {
      fc.assert(
        fc.property(fc.string(), (name) => {
          const slug = generateSlug(name);
          expect(slug).not.toMatch(/--/);
        }),
        { numRuns: 100 }
      );
    });

    it('respects max length constraint', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.integer({ min: 1, max: 100 }),
          (name, maxLength) => {
            const slug = generateSlug(name, maxLength);
            expect(slug.length).toBeLessThanOrEqual(maxLength);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('handles unicode characters by transliterating or removing them', () => {
      fc.assert(
        fc.property(fc.unicodeString(), (name) => {
          const slug = generateSlug(name);
          // Result should only contain ASCII characters
          expect(slug).toMatch(/^[a-z0-9-]*$/);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('generateUniqueSlug', () => {
    it('returns base slug when no conflicts exist', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => /[a-zA-Z0-9]/.test(s)),
          (name) => {
            const existingSlugs = new Set<string>();
            const slug = generateUniqueSlug(name, existingSlugs);
            const baseSlug = generateSlug(name);
            expect(slug).toBe(baseSlug);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('appends numeric suffix when base slug exists', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => /[a-zA-Z0-9]/.test(s)),
          (name) => {
            const baseSlug = generateSlug(name);
            if (baseSlug.length === 0) return true; // Skip empty slugs
            
            const existingSlugs = new Set<string>([baseSlug]);
            const uniqueSlug = generateUniqueSlug(name, existingSlugs);
            
            expect(uniqueSlug).not.toBe(baseSlug);
            expect(uniqueSlug).toMatch(new RegExp(`^${baseSlug.substring(0, 20)}.*-\\d+$`));
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('always produces unique slugs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => /[a-zA-Z0-9]/.test(s)),
          fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 10 }),
          (name, existingNames) => {
            const existingSlugs = new Set(existingNames.map(n => generateSlug(n)));
            const uniqueSlug = generateUniqueSlug(name, existingSlugs);
            
            // The generated slug should not be in the existing set
            // (unless it was already unique)
            const baseSlug = generateSlug(name);
            if (existingSlugs.has(baseSlug)) {
              expect(existingSlugs.has(uniqueSlug)).toBe(false);
            }
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

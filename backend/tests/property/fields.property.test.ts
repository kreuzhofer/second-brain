/**
 * Property-Based Tests for Category Field Extraction
 * 
 * Feature: chat-capture-and-classification
 * Property 3: Category-Field Consistency
 * 
 * **Validates: Requirements 3.6**
 */

import * as fc from 'fast-check';
import {
  extractCategoryFields,
  validateCategoryFields,
  getRequiredFieldKeys,
  getOptionalFieldKeys,
  Category,
} from '../../src/utils/fields';
import { CategoryFields } from '../../src/types/chat.types';

// Arbitrary for generating random category
const categoryArbitrary = fc.constantFrom<Category>('people', 'projects', 'ideas', 'admin');

// Arbitrary for generating random raw fields
const rawFieldsArbitrary = fc.record({
  context: fc.option(fc.string()),
  followUps: fc.option(fc.array(fc.string())),
  follow_ups: fc.option(fc.array(fc.string())),
  relatedProjects: fc.option(fc.array(fc.string())),
  related_projects: fc.option(fc.array(fc.string())),
  status: fc.option(fc.constantFrom('active', 'waiting', 'blocked', 'someday', 'invalid')),
  nextAction: fc.option(fc.string()),
  next_action: fc.option(fc.string()),
  relatedPeople: fc.option(fc.array(fc.string())),
  related_people: fc.option(fc.array(fc.string())),
  dueDate: fc.option(fc.string()),
  due_date: fc.option(fc.string()),
  oneLiner: fc.option(fc.string()),
  one_liner: fc.option(fc.string()),
});

describe('Category Field Extraction - Property Tests', () => {
  /**
   * Property 3: Category-Field Consistency
   * 
   * For any classification result, the fields object SHALL contain exactly
   * the required keys for the classified category:
   * - people: context, followUps, relatedProjects
   * - projects: status, nextAction, relatedPeople (dueDate optional)
   * - ideas: oneLiner, relatedProjects
   * - admin: status, relatedPeople (dueDate optional)
   * 
   * **Validates: Requirements 3.6**
   */
  describe('Property 3: Category-Field Consistency', () => {
    it('extracted fields contain all required keys for people category', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('people', rawFields as Record<string, unknown>);
          const requiredKeys = getRequiredFieldKeys('people');
          
          for (const key of requiredKeys) {
            expect(fields).toHaveProperty(key);
          }
        }),
        { numRuns: 50 }
      );
    });

    it('extracted fields contain all required keys for projects category', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('projects', rawFields as Record<string, unknown>);
          const requiredKeys = getRequiredFieldKeys('projects');
          
          for (const key of requiredKeys) {
            expect(fields).toHaveProperty(key);
          }
        }),
        { numRuns: 50 }
      );
    });

    it('extracted fields contain all required keys for ideas category', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('ideas', rawFields as Record<string, unknown>);
          const requiredKeys = getRequiredFieldKeys('ideas');
          
          for (const key of requiredKeys) {
            expect(fields).toHaveProperty(key);
          }
        }),
        { numRuns: 50 }
      );
    });

    it('extracted fields contain all required keys for admin category', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('admin', rawFields as Record<string, unknown>);
          const requiredKeys = getRequiredFieldKeys('admin');
          
          for (const key of requiredKeys) {
            expect(fields).toHaveProperty(key);
          }
        }),
        { numRuns: 50 }
      );
    });

    it('extracted fields pass validation for any category', () => {
      fc.assert(
        fc.property(categoryArbitrary, rawFieldsArbitrary, (category, rawFields) => {
          const fields = extractCategoryFields(category, rawFields as Record<string, unknown>);
          expect(validateCategoryFields(category, fields)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('people fields have correct types', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('people', rawFields as Record<string, unknown>);
          
          expect(typeof (fields as { context: string }).context).toBe('string');
          expect(Array.isArray((fields as { followUps: string[] }).followUps)).toBe(true);
          expect(Array.isArray((fields as { relatedProjects: string[] }).relatedProjects)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('projects fields have correct types and valid status', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('projects', rawFields as Record<string, unknown>);
          const projectFields = fields as { status: string; nextAction: string; relatedPeople: string[] };
          
          expect(['active', 'waiting', 'blocked', 'someday']).toContain(projectFields.status);
          expect(typeof projectFields.nextAction).toBe('string');
          expect(Array.isArray(projectFields.relatedPeople)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('ideas fields have correct types', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('ideas', rawFields as Record<string, unknown>);
          const ideaFields = fields as { oneLiner: string; relatedProjects: string[] };
          
          expect(typeof ideaFields.oneLiner).toBe('string');
          expect(Array.isArray(ideaFields.relatedProjects)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('admin fields have correct types and status is always pending', () => {
      fc.assert(
        fc.property(rawFieldsArbitrary, (rawFields) => {
          const fields = extractCategoryFields('admin', rawFields as Record<string, unknown>);
          const adminFields = fields as { status: string; relatedPeople: string[] };
          
          expect(adminFields.status).toBe('pending');
          expect(Array.isArray(adminFields.relatedPeople)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('optional dueDate is preserved when provided for projects', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (dueDate) => {
            const fields = extractCategoryFields('projects', { dueDate });
            expect((fields as { dueDate?: string }).dueDate).toBe(dueDate);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('optional dueDate is preserved when provided for admin', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (dueDate) => {
            const fields = extractCategoryFields('admin', { dueDate });
            expect((fields as { dueDate?: string }).dueDate).toBe(dueDate);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

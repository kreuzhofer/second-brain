-- Backfill canonical task category in entry records
UPDATE "Entry"
SET "category" = 'task'
WHERE "category" = 'admin';

-- Backfill digest preference focus categories
UPDATE "DigestPreference"
SET "focusCategories" = array_replace(
  "focusCategories",
  'admin'::"EntryCategory",
  'task'::"EntryCategory"
)
WHERE "focusCategories" @> ARRAY['admin'::"EntryCategory"];

-- Backfill inbox suggested category hints
UPDATE "InboxDetails"
SET "suggestedCategory" = 'task'
WHERE "suggestedCategory" = 'admin';

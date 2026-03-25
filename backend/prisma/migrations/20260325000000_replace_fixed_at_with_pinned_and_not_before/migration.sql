-- Step 1: Add new columns
ALTER TABLE "AdminTaskDetails" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdminTaskDetails" ADD COLUMN "notBefore" TIMESTAMP(3);

-- Step 2: Backfill pinned from fixedAt (tasks with fixedAt become pinned)
UPDATE "AdminTaskDetails" SET "pinned" = true WHERE "fixedAt" IS NOT NULL;

-- Step 3: Preserve fixedAt as dueDate for pinned tasks that have no dueDate
UPDATE "AdminTaskDetails" SET "dueDate" = "fixedAt" WHERE "fixedAt" IS NOT NULL AND "dueDate" IS NULL;

-- Step 4: Drop fixedAt column
ALTER TABLE "AdminTaskDetails" DROP COLUMN "fixedAt";

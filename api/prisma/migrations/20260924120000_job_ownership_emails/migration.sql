-- Isolate jobs per user + email dispatch log + digest timestamp
-- Backfills existing Job rows to the oldest user when present.

CREATE TABLE IF NOT EXISTS "EmailDispatchLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailDispatchLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailDispatchLog_userId_key_key" ON "EmailDispatchLog"("userId", "key");
CREATE INDEX IF NOT EXISTS "EmailDispatchLog_userId_idx" ON "EmailDispatchLog"("userId");

ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "lastDigestEmailAt" TIMESTAMP(3);

-- Job.userId (nullable first for backfill)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "Job" j
SET "userId" = (SELECT u."id" FROM "User" u ORDER BY u."createdAt" ASC LIMIT 1)
WHERE j."userId" IS NULL
  AND EXISTS (SELECT 1 FROM "User" LIMIT 1);

DELETE FROM "Job" WHERE "userId" IS NULL;

ALTER TABLE "Job" ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX IF EXISTS "Job_source_externalId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Job_userId_source_externalId_key" ON "Job"("userId", "source", "externalId");
CREATE INDEX IF NOT EXISTS "Job_userId_idx" ON "Job"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Job_userId_fkey'
  ) THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailDispatchLog_userId_fkey'
  ) THEN
    ALTER TABLE "EmailDispatchLog" ADD CONSTRAINT "EmailDispatchLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

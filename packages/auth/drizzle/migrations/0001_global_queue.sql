-- Global queue: store user-level queue in profile table
ALTER TABLE "profile" ADD COLUMN "queue" text DEFAULT '[]' NOT NULL;
ALTER TABLE "profile" ADD COLUMN "queueIndex" integer DEFAULT -1 NOT NULL;
ALTER TABLE "profile" ADD COLUMN "queueUpdatedAt" integer;

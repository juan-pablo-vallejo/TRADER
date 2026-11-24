-- The Demo company's flag (M8): the Demo sign-in admits people of a flagged company only.
-- The live-database rules (docs/ARCHITECTURE.md, Schema rule): a lock waited on is given up
-- after three seconds, and a column with a constant default is added without a rewrite.
-- The application's role gets no grant on it: the owner alone sets it.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;

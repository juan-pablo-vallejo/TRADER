CREATE TABLE "rate_limit_windows" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limit_windows_pk" PRIMARY KEY("key","window_start"),
	CONSTRAINT "rate_limit_windows_key_is_a_hash" CHECK ("rate_limit_windows"."key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rate_limit_windows_count_positive" CHECK ("rate_limit_windows"."count" > 0)
);

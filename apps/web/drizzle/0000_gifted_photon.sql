CREATE TABLE "saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"author" text,
	"media_url" text,
	"blob_url" text,
	"media_type" text,
	"raw_json" jsonb,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saves_source_source_id_unique" UNIQUE("source","source_id")
);

import {
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const SOURCES = [
  "twitter",
  "instagram",
  "pinterest",
  "arena",
  "cosmos",
] as const;
export type Source = (typeof SOURCES)[number];

export const MEDIA_TYPES = ["image", "video", "link"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const saves = pgTable(
  "saves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").$type<Source>().notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    author: text("author"),
    mediaUrl: text("media_url"),
    blobUrl: text("blob_url"),
    mediaType: text("media_type").$type<MediaType>(),
    rawJson: jsonb("raw_json"),
    tags: text("tags").array().notNull().default([]),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("saves_source_source_id_unique").on(t.source, t.sourceId)],
);

export type Save = typeof saves.$inferSelect;
export type NewSave = typeof saves.$inferInsert;

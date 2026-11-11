import * as schema from "@pond/schema/db";
import * as eventsSchema from "@pond/schema/events";
import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";

const combinedSchema = { ...schema, ...eventsSchema };

export type Db = BetterSQLite3Database<typeof combinedSchema> & {
  $raw: Database.Database;
};

/** Page cache per connection; reads mostly come through mmap, so a large cache only holds memory at idle. */
const LIBRARY_CACHE_KIB = 16_384;
export const GLOBAL_CACHE_KIB = 2_048;

export function openSqlite(
  file: string,
  cacheKiB = LIBRARY_CACHE_KIB,
): Database.Database {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("mmap_size = 268435456");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma(`cache_size = -${cacheKiB}`);
  sqlite.pragma("wal_autocheckpoint = 2000");
  return sqlite;
}

export function wrapSqlite(sqlite: Database.Database): Db {
  const drizzled = drizzle(sqlite, { schema: combinedSchema });
  return Object.assign(drizzled, { $raw: sqlite });
}

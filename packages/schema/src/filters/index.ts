/**
 * Main-side barrel for the filter package. Pulls in the SQL bits
 * (Drizzle, custom SQLite functions) on top of the renderer-safe
 * surface so a single `import { ... } from "@pond/schema/filters"`
 * gives the IPC handler everything it needs.
 *
 * Renderer code MUST NOT import from this file. Use the explicit
 * subpath exports instead:
 *
 *   import type { Query } from "@pond/schema/filters/types";
 *   import { writeQuery } from "@pond/schema/filters/url";
 *   import { migrateLegacyParams } from "@pond/schema/filters/migrate";
 *   import { matches } from "@pond/schema/filters/match";
 *   import { FIELD_META } from "@pond/schema/filters/meta";
 */

export * from "./fields";
export * from "./match";
export * from "./meta";
export * from "./migrate";
export * from "./sqlite-fns";
export * from "./to-sql";
export * from "./types";
export * from "./url";

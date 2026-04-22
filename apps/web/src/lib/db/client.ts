import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@pond/schema/db";

neonConfig.fetchConnectionCache = true;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Provision Neon via the Vercel Marketplace and run `vercel env pull` (or copy .env.example to .env).",
  );
}

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
export { schema };

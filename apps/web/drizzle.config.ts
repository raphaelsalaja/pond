import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../packages/schema/src/db.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});

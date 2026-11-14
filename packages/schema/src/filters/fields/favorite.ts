import { sql } from "drizzle-orm";
import { saves } from "../../db";
import { defineField } from "./descriptor";

const FAVORITE_PRESETS = [
  { id: "favorite", label: "Favorites", value: true },
  { id: "not-favorite", label: "Not Favorites", value: false },
] as const;

export const favorite = defineField({
  id: "favorite",
  type: "boolean",
  label: "Favorite",
  group: "content",
  presets: FAVORITE_PRESETS,
  project: (save) => save.favorite ?? false,
  sqlProjection: () => sql`${saves.favorite}`,
});

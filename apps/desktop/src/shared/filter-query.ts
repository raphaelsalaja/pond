import { QuerySchema } from "@pond/schema/filters";
import type { Query } from "@pond/schema/filters";
import { z } from "zod";

export const FilterQuery = z.custom<Query>(
  (value) => QuerySchema.safeParse(value).success,
);

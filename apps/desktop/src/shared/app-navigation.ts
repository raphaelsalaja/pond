import { QuerySchema } from "@pond/schema/filters";
import { z } from "zod";

export const AppNavigationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save"), id: z.string().min(1) }),
  z.object({ kind: z.literal("filter"), query: QuerySchema }),
]);
export type AppNavigation = z.infer<typeof AppNavigationSchema>;

import { z } from "zod";
import { FIELD_IDS } from "./meta";
import { COMPARATORS_BY_TYPE } from "./types";
import type { ComparatorId, Predicate, Query } from "./types";

const operatorIds: Array<ComparatorId> = [
  ...new Set(Object.values(COMPARATORS_BY_TYPE).flat()),
];

export const PredicateSchema: z.ZodType<Predicate> = z.object({
  id: z.string().optional(),
  field: z.enum(FIELD_IDS),
  operator: z.enum(operatorIds),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number()])),
    z.object({ hex: z.string(), tolerance: z.number() }),
  ]),
  negate: z.boolean().optional(),
});

export const QuerySchema: z.ZodType<Query> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    combinator: z.enum(["and", "or"]),
    not: z.boolean().optional(),
    rules: z.array(z.union([PredicateSchema, QuerySchema])),
  }),
);

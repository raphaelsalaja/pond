import { SOURCES } from "@pond/schema/db";
import { QuerySchema } from "@pond/schema/filters";
import type { Query } from "@pond/schema/filters";
import type { IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type { QueryName, QueryResult } from "../../../shared/query-contracts";

const QueryParamsSchema = z.looseObject({}).catch({});

export type QueryParams = z.infer<typeof QueryParamsSchema>;

export function query<Schema extends z.ZodType, Result>(
  schema: Schema,
  run: (params: z.infer<Schema>, event?: IpcMainInvokeEvent) => Result,
) {
  const handler = (raw?: QueryParams, event?: IpcMainInvokeEvent): Result =>
    run(schema.parse(QueryParamsSchema.parse(raw)), event);
  return Object.assign(handler, { inputSchema: schema });
}

export type QueryHandlerMap = Partial<{
  [Name in QueryName]: (
    raw?: QueryParams,
    event?: IpcMainInvokeEvent,
  ) => QueryResult<Name> | Promise<QueryResult<Name>>;
}>;

export const StringParam = z.coerce
  .string()
  .nullish()
  .transform((value) => value ?? "");

export const NullableStringParam = z.coerce
  .string()
  .nullish()
  .transform((value) => value ?? null);

export const NumberParam = z.coerce.number().catch(Number.NaN);

export const OptionalNumberParam = z.coerce
  .number()
  .nullish()
  .catch(Number.NaN);

export const FileIndexParam = OptionalNumberParam.transform((value) =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : 0,
);

export const NonEmptyTextParam = z
  .string()
  .min(1)
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

export const TrimmedTextParam = z
  .string()
  .nullish()
  .catch(null)
  .transform((value) => value?.trim() || null);

export const SourceParam = z.enum(SOURCES).nullable().catch(null);

export const FlagParam = z.coerce.boolean();

export const StringListParam = z.array(z.coerce.string()).catch([]);

export const QueryParam = z
  .custom<Query>((value) => QuerySchema.safeParse(value).success)
  .nullable()
  .catch(null);

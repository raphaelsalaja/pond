import { ApiTokenCreateSchema } from "@pond/schema/api";
import { z } from "zod";
import { apiTokens } from "../../http/api-tokens";
import { query } from "./params";
import type { QueryHandlerMap } from "./params";

export const apiTokensQueries = {
  async "apiTokens.list"() {
    return { tokens: await apiTokens.list() };
  },

  "apiTokens.create": query(ApiTokenCreateSchema, ({ name, scopes }) =>
    apiTokens.create(name, scopes),
  ),

  "apiTokens.revoke": query(
    z.object({ id: z.string().min(1) }),
    async ({ id }) => ({ ok: await apiTokens.revoke(id) }),
  ),
} satisfies QueryHandlerMap;

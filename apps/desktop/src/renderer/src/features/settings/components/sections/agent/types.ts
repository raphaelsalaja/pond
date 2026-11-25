import type { Prefs } from "@pond/schema";
import { assistantProvider } from "@shared/assistant";
import type { AssistantProvider } from "@shared/assistant";
import { z } from "zod";

export type AgentPrefs = Prefs["agent"];

const keyRowSchema = z.object({
  provider: z.string(),
  hasKey: z.boolean(),
  masked: z.string().nullable(),
  enabled: z.boolean(),
});

export const keyRowsSchema = z.array(keyRowSchema).transform((rows) =>
  rows.flatMap((row) => {
    const provider = assistantProvider.safeParse(row.provider);
    return provider.success ? [{ ...row, provider: provider.data }] : [];
  }),
);

export interface KeyRow {
  provider: AssistantProvider;
  hasKey: boolean;
  masked: string | null;
  enabled: boolean;
}

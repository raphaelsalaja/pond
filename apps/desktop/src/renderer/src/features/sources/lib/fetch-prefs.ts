import type { IncomingSaveRule } from "@pond/schema/db";
import { z } from "zod";

export interface SourceFetchPrefs {
  paused?: boolean;
  intervalHours?: number;
  incoming?: IncomingSaveRule;
}

export const SOURCE_FETCH_PREF_FIELDS = {
  paused: z.boolean().optional().catch(undefined),
  intervalHours: z.number().optional().catch(undefined),
  incoming: z
    .object({
      folderId: z.string().optional().catch(undefined),
      tags: z.array(z.string()).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
};

export const FETCH_INTERVAL_HOURS = [1, 3, 6, 12, 24, 48, 168] as const;

export function intervalLabel(hours: number): string {
  if (hours === 168) return "Every Week";
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "Every Day" : `Every ${days} Days`;
  }
  return hours === 1 ? "Every Hour" : `Every ${hours} Hours`;
}

import { z } from "zod";

const OptionalText = z.string().min(1).optional().catch(undefined);

const UserSchema = z
  .object({ uniqueId: OptionalText })
  .optional()
  .catch(undefined);

export const TiktokHydrationSchema = z
  .object({
    __DEFAULT_SCOPE__: z
      .object({
        "webapp.app-context": z
          .object({
            user: UserSchema,
            userInfo: z
              .object({ user: UserSchema })
              .optional()
              .catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    AppContext: z
      .object({
        user: UserSchema,
        appContext: z.object({ user: UserSchema }).optional().catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

export type TiktokHydration = z.infer<typeof TiktokHydrationSchema>;

export function uniqueIdFromHydration(data: TiktokHydration): string | null {
  const app = data.__DEFAULT_SCOPE__?.["webapp.app-context"];
  const fromScope =
    app?.user?.uniqueId ?? app?.userInfo?.user?.uniqueId ?? undefined;
  const fromSigi =
    data.AppContext?.user?.uniqueId ??
    data.AppContext?.appContext?.user?.uniqueId ??
    undefined;
  return handleFromUniqueId(fromScope ?? fromSigi);
}

export function uniqueIdFromTiktokHtml(html: string): string | null {
  for (const id of ["__UNIVERSAL_DATA_FOR_REHYDRATION__", "SIGI_STATE"]) {
    const json = scriptJson(html, id);
    if (!json) continue;
    const handle = uniqueIdFromHydration(json);
    if (handle) return handle;
  }
  return null;
}

function handleFromUniqueId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const handle = value.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9._]{2,24}$/.test(handle)) return null;
  return handle;
}

function scriptJson(html: string, id: string): TiktokHydration | null {
  const re = new RegExp(
    `<script[^>]*\\sid=["']${id}["'][^>]*>([\\s\\S]*?)</script>`,
    "i",
  );
  const match = re.exec(html);
  if (!match?.[1]) return null;
  try {
    const parsed = TiktokHydrationSchema.safeParse(JSON.parse(match[1].trim()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

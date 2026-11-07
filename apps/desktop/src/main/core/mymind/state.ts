import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  readBundleJsonAsync,
  writeBundleJsonAsync,
} from "../../lib/library-config";

const ImportedSaveSchema = z.strictObject({
  saveId: z.string().min(1),
  complete: z.boolean(),
});

const MymindSyncStateSchema = z
  .strictObject({
    startedAt: z.iso.datetime({ offset: true }),
    checkedThrough: z.iso.datetime({ offset: true }),
    imports: z.record(z.string().min(1), ImportedSaveSchema),
    retryAt: z.number().int().nonnegative().optional(),
  })
  .refine(
    (state) => Date.parse(state.checkedThrough) >= Date.parse(state.startedAt),
  );

export type MymindSyncState = z.infer<typeof MymindSyncStateSchema>;

export function createMymindSyncState(now: number): MymindSyncState {
  const startedAt = new Date(now).toISOString();
  return { startedAt, checkedThrough: startedAt, imports: {} };
}

function statePath(root: string, accountId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(accountId))
    throw new Error("The mymind account ID is invalid.");
  return join(root, "mymind", `${accountId}.json`);
}

export async function readMymindSyncState(
  root: string,
  accountId: string,
): Promise<MymindSyncState> {
  const bundle = await readBundleJsonAsync<MymindSyncState>(
    statePath(root, accountId),
  );
  const parsed = MymindSyncStateSchema.safeParse(bundle?.data);
  if (!parsed.success)
    throw new Error("The mymind import state is missing or invalid.");
  return parsed.data;
}

export async function writeMymindSyncState(
  root: string,
  accountId: string,
  state: MymindSyncState,
): Promise<void> {
  const parsed = MymindSyncStateSchema.safeParse(state);
  if (!parsed.success) throw new Error("The mymind import state is invalid.");
  await writeBundleJsonAsync(statePath(root, accountId), parsed.data);
}

export async function removeMymindSyncState(
  root: string,
  accountId: string,
): Promise<void> {
  await rm(statePath(root, accountId), { force: true });
}

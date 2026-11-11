import type { UpdateNotice } from "@shared/update-notice";
import { UpdateNoticeSchema } from "@shared/update-notice";
import { Store } from "@tanstack/store";
import { z } from "zod";
import { loadAppInfo } from "@/shared/lib/app-info";
import { updateDialogCopy } from "./copy";

export type UpdateDialogView =
  | { kind: "checking" }
  | { kind: "current"; version: string }
  | { kind: "failed"; message: string; retry: boolean }
  | { kind: "update"; notice: UpdateNotice; explicit: boolean };

export interface UpdateDialogModel {
  open: boolean;
  view: UpdateDialogView | null;
}

const CHECK_FAILED = "Couldn't check for updates. Try again.";
const DEV_BUILD = "Updates are only available in packaged builds.";

const CheckResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    version: z.string().optional(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.literal("dev_build"),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string().optional(),
  }),
]);

type UpdateCheckResult = z.infer<typeof CheckResultSchema>;

export interface UpdateCheckClient {
  appInfo(): Promise<{ version: string }>;
  checkNow(): Promise<UpdateCheckResult>;
  currentNotice(): Promise<UpdateNotice | null>;
}

const defaultClient: UpdateCheckClient = {
  appInfo: () => loadAppInfo(),
  checkNow: async () => {
    const parsed = CheckResultSchema.safeParse(
      await window.pond.query("updates.checkNow", {}),
    );
    return parsed.success ? parsed.data : { ok: false };
  },
  currentNotice: async () => {
    const parsed = UpdateNoticeSchema.nullable().safeParse(
      await window.pond.query("updates.currentNotice", {}),
    );
    return parsed.success ? parsed.data : null;
  },
};

export const updateDialogStore = new Store<UpdateDialogModel>({
  open: false,
  view: null,
});

let generation = 0;
let inFlight = false;

export function readUpdateDialog(): UpdateDialogModel {
  return updateDialogStore.state;
}

function failureView(
  result: Exclude<UpdateCheckResult, { ok: true }>,
): UpdateDialogView {
  if ("reason" in result) {
    return { kind: "failed", message: DEV_BUILD, retry: false };
  }
  const message = result.error?.trim() ? result.error : CHECK_FAILED;
  return { kind: "failed", message, retry: true };
}

/** Prefer the updater's phase so a finished download offers Restart immediately. */
function successView(input: {
  currentVersion: string;
  reportedVersion?: string;
  notice: UpdateNotice | null;
}): UpdateDialogView {
  const { currentVersion, reportedVersion, notice } = input;
  if (notice && notice.version !== currentVersion) {
    return { kind: "update", notice, explicit: true };
  }
  if (reportedVersion && reportedVersion !== currentVersion) {
    return {
      kind: "update",
      explicit: true,
      notice: {
        phase: "available",
        version: reportedVersion,
        downloading: false,
      },
    };
  }
  return { kind: "current", version: currentVersion };
}

/**
 * Background downloads stay quiet until the build is ready to install.
 * A dialog the user already opened keeps tracking that download.
 */
export function presentUpdateNotice(notice: UpdateNotice): void {
  const state = updateDialogStore.state;
  if (state.open && state.view?.kind === "checking") return;
  if (state.open && state.view?.kind === "update") {
    const explicit = state.view.explicit;
    updateDialogStore.setState(() => ({
      open: true,
      view: { kind: "update", notice, explicit },
    }));
    return;
  }
  if (!updateDialogCopy(notice)) return;
  updateDialogStore.setState(() => ({
    open: true,
    view: { kind: "update", notice, explicit: false },
  }));
}

export function dismissUpdateDialog(): void {
  generation += 1;
  inFlight = false;
  updateDialogStore.setState((state) =>
    state.open ? { ...state, open: false } : state,
  );
}

export function requestUpdateCheck(
  client: UpdateCheckClient = defaultClient,
): void {
  if (inFlight) return;
  inFlight = true;
  const token = ++generation;
  updateDialogStore.setState(() => ({
    open: true,
    view: { kind: "checking" },
  }));
  void settleUpdateCheck(token, client);
}

async function settleUpdateCheck(
  token: number,
  client: UpdateCheckClient,
): Promise<void> {
  try {
    const view = await loadUpdateView(client);
    updateDialogStore.setState((state) => {
      if (token !== generation) return state;
      return { open: true, view };
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : CHECK_FAILED;
    updateDialogStore.setState((state) => {
      if (token !== generation) return state;
      return {
        open: true,
        view: { kind: "failed", message, retry: true },
      };
    });
  } finally {
    if (token === generation) inFlight = false;
  }
}

async function loadUpdateView(
  client: UpdateCheckClient,
): Promise<UpdateDialogView> {
  const [info, result] = await Promise.all([
    client.appInfo(),
    client.checkNow(),
  ]);
  if (!result.ok) return failureView(result);
  let notice: UpdateNotice | null = null;
  try {
    notice = await client.currentNotice();
  } catch {
    notice = null;
  }
  return successView({
    currentVersion: info.version,
    reportedVersion: result.version,
    notice,
  });
}

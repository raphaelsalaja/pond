import type { UpdateNotice } from "@shared/update-notice";
import {
  dismissUpdateDialog,
  presentUpdateNotice,
  readUpdateDialog,
  requestUpdateCheck,
  showUpdateRestarting,
  updateNoticeStore,
} from "./session";

const CURRENT = "2.3.0";
const NEXT = "2.4.0";

export type UpdateButtonPreview =
  | "available"
  | "downloading"
  | "downloaded"
  | "none";

let run = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Plays check, prompt, download and restart against fake updater data, for the dev preview route. */
export async function playUpdatePreview(): Promise<void> {
  const token = ++run;
  const live = () => token === run;
  const open = () => live() && readUpdateDialog().open;
  updateNoticeStore.setState(() => null);

  requestUpdateCheck({
    appInfo: async () => ({ version: CURRENT }),
    checkNow: async () => {
      await wait(1400);
      return { ok: true, version: NEXT };
    },
    currentNotice: async () => ({
      phase: "available",
      version: NEXT,
      downloading: false,
    }),
  });

  await wait(3400);
  if (!open()) return;
  presentUpdateNotice({ phase: "available", version: NEXT, downloading: true });
  await wait(700);

  for (let percent = 0; percent <= 100; percent += 2) {
    if (!live()) return;
    presentUpdateNotice({
      phase: "available",
      version: NEXT,
      downloading: true,
      progress: percent / 100,
    });
    await wait(60);
  }
  if (!live()) return;
  presentUpdateNotice({ phase: "downloaded", version: NEXT });

  await wait(2400);
  if (!open()) return;
  showUpdateRestarting(NEXT);
  await wait(2600);
  if (!open()) return;
  dismissUpdateDialog();
}

/** Sets the rail button's state without opening the overlay. */
export function showUpdateButtonPreview(state: UpdateButtonPreview): void {
  run += 1;
  const notices = {
    available: { phase: "available", version: NEXT, downloading: false },
    downloading: {
      phase: "available",
      version: NEXT,
      downloading: true,
      progress: 0.46,
    },
    downloaded: { phase: "downloaded", version: NEXT },
    none: null,
  } satisfies Record<UpdateButtonPreview, UpdateNotice | null>;
  const notice = notices[state];
  if (notice) presentUpdateNotice(notice);
  else updateNoticeStore.setState(() => null);
}

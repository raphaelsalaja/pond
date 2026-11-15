import { DEFAULT_PREFS } from "@pond/schema/db";
import { applyInboxChange } from "@pond/schema/inbox";
import { describe, expect, it } from "vitest";
import { inboxChannelForTrigger, inboxEntry } from "./intake";

describe("inbox intake", () => {
  it("files each enqueue trigger under the capture path it came from", () => {
    expect(inboxChannelForTrigger(undefined)).toBe("captures");
    expect(inboxChannelForTrigger("user:quickAdd")).toBe("captures");
    expect(inboxChannelForTrigger("shortcut:save")).toBe("captures");
    expect(inboxChannelForTrigger("action")).toBe("captures");
    expect(inboxChannelForTrigger("sync:github")).toBe("sync");
    expect(inboxChannelForTrigger("sync:mymind")).toBe("sync");
    expect(inboxChannelForTrigger("cron")).toBe("sync");
    expect(inboxChannelForTrigger("watch:youtube")).toBe("watches");
    expect(inboxChannelForTrigger("user:importBookmarks")).toBe("imports");
    expect(inboxChannelForTrigger("user:importDataExport")).toBe("imports");
  });

  it("sends only one-off captures to the Inbox by default", () => {
    expect(DEFAULT_PREFS.inbox).toEqual({
      enabled: true,
      channels: { captures: true, sync: false, watches: false, imports: false },
    });
    expect(inboxEntry("captures", DEFAULT_PREFS)).toEqual({
      inboxState: "review",
      inboxUntil: null,
    });
    for (const channel of ["sync", "watches", "imports"] as const)
      expect(inboxEntry(channel, DEFAULT_PREFS).inboxState).toBeNull();
    expect(inboxEntry(undefined, DEFAULT_PREFS).inboxState).toBeNull();
  });

  it("keeps every path out while the Inbox is off", () => {
    const prefs = {
      inbox: {
        enabled: false,
        channels: { captures: true, sync: true, watches: true, imports: true },
      },
    };
    expect(inboxEntry("captures", prefs).inboxState).toBeNull();
    expect(inboxEntry("sync", prefs).inboxState).toBeNull();
  });
});

describe("inbox changes", () => {
  const never = { inboxState: null, inboxUntil: null };
  const review = { inboxState: "review" as const, inboxUntil: null };

  it("skips changes that would leave a Save as it is", () => {
    expect(applyInboxChange({ kind: "inbox", state: "review" }, review)).toBe(
      null,
    );
    expect(
      applyInboxChange({ kind: "inbox", state: "processed" }, never),
    ).toBeNull();
    expect(applyInboxChange({ kind: "inbox", state: null }, never)).toBeNull();
  });

  it("never sends a Save in the Trash to the Inbox", () => {
    const trashed = { ...never, deletedAt: 1 };
    expect(
      applyInboxChange({ kind: "inbox", state: "review" }, trashed),
    ).toBeNull();
    expect(applyInboxChange({ kind: "snooze", until: 5 }, trashed)).toBeNull();
  });
});

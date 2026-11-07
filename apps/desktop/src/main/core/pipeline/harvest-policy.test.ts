import { describe, expect, it } from "vitest";
import {
  harvestShouldAdoptSave,
  harvestShouldIgnoreSave,
  harvestShouldReseedFailedSave,
  harvestShouldRestoreSave,
} from "./harvest-policy";

describe("harvestShouldAdoptSave", () => {
  const connected = new Set(["current", "other"]);

  it("moves a disconnected account's save to the account that lists it", () => {
    expect(
      harvestShouldAdoptSave({ accountId: "removed" }, "current", connected),
    ).toBe(true);
  });

  it("keeps a disconnected account's Save when adoption is disabled", () => {
    expect(
      harvestShouldAdoptSave(
        { accountId: "removed" },
        "mymind-account",
        connected,
        false,
      ),
    ).toBe(false);
    expect(
      harvestShouldAdoptSave(
        { accountId: "removed" },
        "mymind-account",
        connected,
        true,
      ),
    ).toBe(true);
  });

  it("leaves saves owned by a connected account or by no account", () => {
    expect(
      harvestShouldAdoptSave({ accountId: "other" }, "current", connected),
    ).toBe(false);
    expect(
      harvestShouldAdoptSave({ accountId: "current" }, "current", connected),
    ).toBe(false);
    expect(
      harvestShouldAdoptSave({ accountId: null }, "current", connected),
    ).toBe(false);
  });

  it("does nothing outside an account sync", () => {
    expect(
      harvestShouldAdoptSave({ accountId: "removed" }, undefined, connected),
    ).toBe(false);
  });
});

describe("harvestShouldIgnoreSave", () => {
  it("ignores skipped and trashed saves", () => {
    expect(
      harvestShouldIgnoreSave({ status: "skipped", deletedAt: null }),
    ).toBe(true);
    expect(
      harvestShouldIgnoreSave({
        status: "failed",
        deletedAt: new Date(1),
      }),
    ).toBe(true);
    expect(harvestShouldIgnoreSave({ status: "failed", deletedAt: null })).toBe(
      false,
    );
  });
});

describe("harvestShouldRestoreSave", () => {
  it("restores a trashed save only for an interactive save", () => {
    const trashed = { status: "complete", deletedAt: new Date(1) } as const;
    expect(harvestShouldRestoreSave(trashed, true)).toBe(true);
    expect(harvestShouldRestoreSave(trashed, false)).toBe(false);
    expect(
      harvestShouldRestoreSave({ status: "complete", deletedAt: null }, true),
    ).toBe(false);
    expect(
      harvestShouldRestoreSave(
        { status: "skipped", deletedAt: new Date(1) },
        true,
      ),
    ).toBe(false);
  });
});

describe("harvestShouldReseedFailedSave", () => {
  it("reseeds a live failed save only when a seed is present", () => {
    expect(
      harvestShouldReseedFailedSave(
        { status: "failed", deletedAt: null },
        true,
      ),
    ).toBe(true);
    expect(
      harvestShouldReseedFailedSave(
        { status: "failed", deletedAt: null },
        false,
      ),
    ).toBe(false);
    expect(
      harvestShouldReseedFailedSave(
        { status: "skipped", deletedAt: null },
        true,
      ),
    ).toBe(false);
    expect(
      harvestShouldReseedFailedSave(
        { status: "failed", deletedAt: new Date(1) },
        true,
      ),
    ).toBe(false);
  });
});

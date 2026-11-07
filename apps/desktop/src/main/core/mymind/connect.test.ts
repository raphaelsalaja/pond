import {
  type ConnectedAccount,
  DEFAULT_SOURCE_SYNC_PREFS,
} from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import { connectMymind, isMymindConnecting } from "./connect";
import { createMymindSyncState } from "./state";

const now = Date.parse("2026-11-06T12:00:00Z");
const credential = { kid: "key", secret: "YWJjZGVmZ2hpamtsbW5vcA==" };
const existingAccount: ConnectedAccount = {
  id: "existing",
  source: "mymind",
  handle: null,
  identityKey: null,
  label: "mymind",
  addedAt: "2026-11-01T00:00:00Z",
  sync: { ...DEFAULT_SOURCE_SYNC_PREFS },
};

function fixture(existing: ConnectedAccount | null = null) {
  const state = createMymindSyncState(now - 10_000);
  const root = vi.fn(() => "/library");
  const dependencies = {
    root,
    now: () => now,
    newId: () => "new-account",
    getAccount: vi.fn(async () => existing),
    isSyncing: vi.fn(() => false),
    validate: vi.fn(async () => {}),
    readState: vi.fn(async () => state),
    writeState: vi.fn(async () => {}),
    removeState: vi.fn(async () => {}),
    writeCredential: vi.fn(async () => {}),
    removeCredential: vi.fn(async () => {}),
    patchAccountSync: vi.fn(async () => ({ ...DEFAULT_SOURCE_SYNC_PREFS })),
    createAccount: vi.fn(
      async (
        input: Parameters<
          NonNullable<Parameters<typeof connectMymind>[1]>["createAccount"]
        >[0],
      ) => ({
        id: input.id ?? "new-account",
        source: input.source,
        handle: input.handle ?? null,
        identityKey: input.identityKey ?? null,
        label: input.label ?? null,
        addedAt: new Date(now).toISOString(),
        sync: input.sync ?? { ...DEFAULT_SOURCE_SYNC_PREFS },
      }),
    ),
  };
  return { dependencies, state };
}

describe("mymind connection", () => {
  it("starts new imports at the time the key is accepted", async () => {
    const f = fixture();
    const result = await connectMymind(credential, f.dependencies);
    expect(result.ok).toBe(true);
    expect(f.dependencies.writeState).toHaveBeenCalledWith(
      "/library",
      "new-account",
      createMymindSyncState(now),
    );
    expect(f.dependencies.writeCredential).toHaveBeenCalledWith(
      "new-account",
      credential,
    );
  });

  it("does not store a rejected key or create an Account", async () => {
    const f = fixture();
    f.dependencies.validate.mockRejectedValue(new Error("Rejected key."));
    await expect(connectMymind(credential, f.dependencies)).rejects.toThrow(
      "Rejected key.",
    );
    expect(f.dependencies.writeCredential).not.toHaveBeenCalled();
    expect(f.dependencies.createAccount).not.toHaveBeenCalled();
  });

  it("keeps the original start time and item IDs when reconnecting", async () => {
    const existing = existingAccount;
    const f = fixture(existing);
    f.state.imports.saved = { saveId: "save", complete: true };
    await expect(
      connectMymind({ ...credential, accountId: existing.id }, f.dependencies),
    ).resolves.toEqual({ ok: true, account: existing });
    expect(f.dependencies.readState).toHaveBeenCalledWith(
      "/library",
      existing.id,
    );
    expect(f.dependencies.writeState).not.toHaveBeenCalled();
    expect(f.dependencies.createAccount).not.toHaveBeenCalled();
  });

  it("refuses to change Libraries during connection", async () => {
    const f = fixture();
    f.dependencies.validate.mockImplementation(async () => {
      f.dependencies.root.mockReturnValue("/other-library");
    });
    await expect(connectMymind(credential, f.dependencies)).resolves.toEqual({
      ok: false,
      error: "The Library changed. Connect mymind again.",
    });
    expect(f.dependencies.writeCredential).not.toHaveBeenCalled();
  });

  it("blocks a second reconnect until the first one finishes", async () => {
    const f = fixture(existingAccount);
    let release = () => {};
    f.dependencies.validate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const input = { ...credential, accountId: existingAccount.id };
    const pending = connectMymind(input, f.dependencies);
    await vi.waitFor(() =>
      expect(isMymindConnecting(existingAccount.id)).toBe(true),
    );
    await expect(connectMymind(input, f.dependencies)).resolves.toMatchObject({
      ok: false,
    });
    release();
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(isMymindConnecting(existingAccount.id)).toBe(false);
  });

  it("releases the connection lock after validation fails", async () => {
    const f = fixture(existingAccount);
    f.dependencies.validate.mockRejectedValue(new Error("Rejected key."));
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).rejects.toThrow("Rejected key.");
    expect(isMymindConnecting(existingAccount.id)).toBe(false);
  });

  it("checks for a running sync again before replacing the key", async () => {
    const f = fixture(existingAccount);
    f.dependencies.validate.mockImplementation(async () => {
      f.dependencies.isSyncing.mockReturnValue(true);
    });
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(f.dependencies.writeCredential).not.toHaveBeenCalled();
  });

  it("stops when the Library changes while it reads the saved start time", async () => {
    const f = fixture(existingAccount);
    f.dependencies.readState.mockImplementation(async () => {
      f.dependencies.root.mockReturnValue("/other-library");
      return f.state;
    });
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(f.dependencies.writeCredential).not.toHaveBeenCalled();
    expect(f.dependencies.patchAccountSync).not.toHaveBeenCalled();
  });

  it("removes a replacement key if the account is disconnected during its write", async () => {
    const f = fixture(existingAccount);
    f.dependencies.writeCredential.mockImplementation(async () => {
      f.dependencies.getAccount.mockResolvedValue(null);
    });
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toEqual({ ok: false, error: "mymind Account not found." });
    expect(f.dependencies.removeCredential).toHaveBeenCalledWith(
      existingAccount.id,
    );
    expect(f.dependencies.patchAccountSync).not.toHaveBeenCalled();
  });

  it("removes a new key and its state when account creation fails", async () => {
    const f = fixture();
    f.dependencies.createAccount.mockRejectedValue(new Error("Disk is full."));
    await expect(connectMymind(credential, f.dependencies)).rejects.toThrow(
      "Disk is full.",
    );
    expect(f.dependencies.removeCredential).toHaveBeenCalledWith("new-account");
    expect(f.dependencies.removeState).toHaveBeenCalledWith(
      "/library",
      "new-account",
    );
  });

  it("removes incomplete setup if the Library changes during the key write", async () => {
    const f = fixture();
    f.dependencies.writeCredential.mockImplementation(async () => {
      f.dependencies.root.mockReturnValue("/other-library");
    });
    await expect(
      connectMymind(credential, f.dependencies),
    ).resolves.toMatchObject({ ok: false });
    expect(f.dependencies.createAccount).not.toHaveBeenCalled();
    expect(f.dependencies.removeCredential).toHaveBeenCalledWith("new-account");
    expect(f.dependencies.removeState).toHaveBeenCalledWith(
      "/library",
      "new-account",
    );
  });

  it("does not update another Library after it writes the key", async () => {
    const f = fixture(existingAccount);
    f.dependencies.writeCredential.mockImplementation(async () => {
      f.dependencies.root.mockReturnValue("/other-library");
    });
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(f.dependencies.patchAccountSync).not.toHaveBeenCalled();
  });
});

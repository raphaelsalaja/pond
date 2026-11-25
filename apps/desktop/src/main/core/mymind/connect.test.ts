import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import type { ConnectedAccount } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import { connectMymind, isMymindConnecting } from "./connect";
import { createMymindSyncState } from "./state";

function noop(): void {}

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

type ConnectDependencies = NonNullable<Parameters<typeof connectMymind>[1]>;

interface ConnectWorld {
  root: string;
  account: ConnectedAccount | null;
  syncing: boolean;
  validate: ConnectDependencies["validate"];
  readState: () => ReturnType<ConnectDependencies["readState"]>;
  writeCredential: () => Promise<void>;
  createAccount: ConnectDependencies["createAccount"];
}

function fixture(existing: ConnectedAccount | null = null) {
  const state = createMymindSyncState(now - 10_000);
  const world: ConnectWorld = {
    root: "/library",
    account: existing,
    syncing: false,
    validate: async () => {},
    readState: async () => state,
    writeCredential: async () => {},
    createAccount: async (input) => ({
      id: input.id ?? "new-account",
      source: input.source,
      handle: input.handle ?? null,
      identityKey: input.identityKey ?? null,
      label: input.label ?? null,
      addedAt: new Date(now).toISOString(),
      sync: input.sync ?? { ...DEFAULT_SOURCE_SYNC_PREFS },
    }),
  };
  const dependencies: ConnectDependencies = {
    root: () => world.root,
    now: () => now,
    newId: () => "new-account",
    getAccount: async () => world.account,
    isSyncing: () => world.syncing,
    validate: (input) => world.validate(input),
    readState: () => world.readState(),
    writeState: async () => {},
    removeState: async () => {},
    writeCredential: () => world.writeCredential(),
    removeCredential: async () => {},
    patchAccountSync: async () => ({ ...DEFAULT_SOURCE_SYNC_PREFS }),
    createAccount: (input) => world.createAccount(input),
  };
  const spy = {
    readState: vi.spyOn(dependencies, "readState"),
    writeState: vi.spyOn(dependencies, "writeState"),
    removeState: vi.spyOn(dependencies, "removeState"),
    writeCredential: vi.spyOn(dependencies, "writeCredential"),
    removeCredential: vi.spyOn(dependencies, "removeCredential"),
    patchAccountSync: vi.spyOn(dependencies, "patchAccountSync"),
    createAccount: vi.spyOn(dependencies, "createAccount"),
  };
  return { dependencies, state, world, spy };
}

describe("mymind connection", () => {
  it("starts new imports at the time the key is accepted", async () => {
    const f = fixture();
    const result = await connectMymind(credential, f.dependencies);
    expect(result.ok).toBe(true);
    expect(f.spy.writeState).toHaveBeenCalledWith(
      "/library",
      "new-account",
      createMymindSyncState(now),
    );
    expect(f.spy.writeCredential).toHaveBeenCalledWith(
      "new-account",
      credential,
    );
  });

  it("does not store a rejected key or create an Account", async () => {
    const f = fixture();
    f.world.validate = async () => {
      throw new Error("Rejected key.");
    };
    await expect(connectMymind(credential, f.dependencies)).rejects.toThrow(
      "Rejected key.",
    );
    expect(f.spy.writeCredential).not.toHaveBeenCalled();
    expect(f.spy.createAccount).not.toHaveBeenCalled();
  });

  it("keeps the original start time and item IDs when reconnecting", async () => {
    const existing = existingAccount;
    const f = fixture(existing);
    f.state.imports.saved = { saveId: "save", complete: true };
    await expect(
      connectMymind({ ...credential, accountId: existing.id }, f.dependencies),
    ).resolves.toEqual({ ok: true, account: existing });
    expect(f.spy.readState).toHaveBeenCalledWith("/library", existing.id);
    expect(f.spy.writeState).not.toHaveBeenCalled();
    expect(f.spy.createAccount).not.toHaveBeenCalled();
  });

  it("refuses to change Libraries during connection", async () => {
    const f = fixture();
    f.world.validate = async () => {
      f.world.root = "/other-library";
    };
    await expect(connectMymind(credential, f.dependencies)).resolves.toEqual({
      ok: false,
      error: "The Library changed. Connect mymind again.",
    });
    expect(f.spy.writeCredential).not.toHaveBeenCalled();
  });

  it("blocks a second reconnect until the first one finishes", async () => {
    const f = fixture(existingAccount);
    let release: () => void = noop;
    f.world.validate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
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
    f.world.validate = async () => {
      throw new Error("Rejected key.");
    };
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
    f.world.validate = async () => {
      f.world.syncing = true;
    };
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(f.spy.writeCredential).not.toHaveBeenCalled();
  });

  it("stops when the Library changes while it reads the saved start time", async () => {
    const f = fixture(existingAccount);
    f.world.readState = async () => {
      f.world.root = "/other-library";
      return f.state;
    };
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(f.spy.writeCredential).not.toHaveBeenCalled();
    expect(f.spy.patchAccountSync).not.toHaveBeenCalled();
  });

  it("removes a replacement key if the account is disconnected during its write", async () => {
    const f = fixture(existingAccount);
    f.world.writeCredential = async () => {
      f.world.account = null;
    };
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toEqual({ ok: false, error: "mymind Account not found." });
    expect(f.spy.removeCredential).toHaveBeenCalledWith(existingAccount.id);
    expect(f.spy.patchAccountSync).not.toHaveBeenCalled();
  });

  it("removes a new key and its state when account creation fails", async () => {
    const f = fixture();
    f.world.createAccount = async () => {
      throw new Error("Disk is full.");
    };
    await expect(connectMymind(credential, f.dependencies)).rejects.toThrow(
      "Disk is full.",
    );
    expect(f.spy.removeCredential).toHaveBeenCalledWith("new-account");
    expect(f.spy.removeState).toHaveBeenCalledWith("/library", "new-account");
  });

  it("removes incomplete setup if the Library changes during the key write", async () => {
    const f = fixture();
    f.world.writeCredential = async () => {
      f.world.root = "/other-library";
    };
    await expect(
      connectMymind(credential, f.dependencies),
    ).resolves.toMatchObject({ ok: false });
    expect(f.spy.createAccount).not.toHaveBeenCalled();
    expect(f.spy.removeCredential).toHaveBeenCalledWith("new-account");
    expect(f.spy.removeState).toHaveBeenCalledWith("/library", "new-account");
  });

  it("does not update another Library after it writes the key", async () => {
    const f = fixture(existingAccount);
    f.world.writeCredential = async () => {
      f.world.root = "/other-library";
    };
    await expect(
      connectMymind(
        { ...credential, accountId: existingAccount.id },
        f.dependencies,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(f.spy.patchAccountSync).not.toHaveBeenCalled();
  });
});

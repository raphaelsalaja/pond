import { describe, expect, it, vi } from "vitest";
import { connectByHandle } from "./connect";
import type { ConnectDeps, NewHandleAccount } from "./connect";

function deps(over: Partial<ConnectDeps> = {}): ConnectDeps {
  const d: ConnectDeps = {
    resolve: async () => ({
      did: "did:plc:abc",
      handle: "alice.bsky.social",
    }),
    findByIdentity: async () => null,
    create: async (account: NewHandleAccount) => ({
      id: "acc1",
      ...account,
    }),
    started: () => {},
    ...over,
  };
  vi.spyOn(d, "resolve");
  vi.spyOn(d, "create");
  vi.spyOn(d, "started");
  return d;
}

describe("connectByHandle", () => {
  it("creates an Account keyed by DID and waits for the import choice", async () => {
    const d = deps();
    expect(await connectByHandle("@Alice.bsky.social ", d)).toEqual({
      ok: true,
      accountId: "acc1",
    });
    expect(d.resolve).toHaveBeenCalledWith("alice.bsky.social");
    expect(d.create).toHaveBeenCalledWith({
      source: "bluesky",
      handle: "alice.bsky.social",
      identityKey: "did:plc:abc",
    });
    expect(d.started).toHaveBeenCalledWith("acc1");
  });

  it("reuses the Account for a DID it already knows", async () => {
    const d = deps({ findByIdentity: async () => ({ id: "old" }) });
    expect(await connectByHandle("alice.bsky.social", d)).toEqual({
      ok: true,
      accountId: "old",
    });
    expect(d.create).not.toHaveBeenCalled();
    expect(d.started).toHaveBeenCalledWith("old");
  });

  it("accepts a DID in place of a handle", async () => {
    const d = deps();
    await connectByHandle("did:plc:abc", d);
    expect(d.resolve).toHaveBeenCalledWith("did:plc:abc");
  });

  it("rejects a handle that does not resolve", async () => {
    const d = deps({ resolve: async () => null });
    expect(await connectByHandle("nobody.example", d)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(d.started).not.toHaveBeenCalled();
  });

  it("rejects input that is not a handle", async () => {
    const d = deps();
    expect(await connectByHandle("not a handle", d)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(d.resolve).not.toHaveBeenCalled();
  });
});

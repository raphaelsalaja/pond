import { describe, expect, it } from "vitest";
import { createApiTokenStore } from "./api-tokens";
import type { ApiTokenStorage } from "./api-tokens";

function memoryStorage(initial: string | null = null) {
  const state = { value: initial, writes: 0 };
  const storage: ApiTokenStorage = {
    read: async () => state.value,
    write: async (value) => {
      state.value = value;
      state.writes += 1;
    },
  };
  return { state, storage };
}

function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("createApiTokenStore", () => {
  it("authenticates a created token and never stores it in plain text", async () => {
    const { state, storage } = memoryStorage();
    const store = createApiTokenStore(storage, () => 1000);
    const { token, info } = await store.create("Alfred", ["search", "search"]);

    expect(token).toMatch(/^pond_[0-9a-f]{48}$/);
    expect(info).toMatchObject({
      name: "Alfred",
      scopes: ["search"],
      createdAt: 1000,
      lastUsedAt: null,
    });
    expect(state.value).not.toContain(token);
    expect(await store.authenticate(token)).toMatchObject({ id: info.id });
    expect(await store.authenticate(`${token}0`)).toBeNull();
    expect(await store.authenticate("not-a-pond-token")).toBeNull();
  });

  it("rejects a token after it's revoked", async () => {
    const store = createApiTokenStore(memoryStorage().storage);
    const { token, info } = await store.create("Script", ["write"]);

    expect(await store.revoke(info.id)).toBe(true);
    expect(await store.revoke(info.id)).toBe(false);
    expect(await store.authenticate(token)).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it("lists tokens without their digests", async () => {
    const store = createApiTokenStore(memoryStorage().storage);
    await store.create("One", ["search"]);
    await store.create("Two", ["export", "write"]);

    const listed = await store.list();
    expect(listed.map((entry) => entry.name)).toEqual(["One", "Two"]);
    expect(listed.every((entry) => !("hash" in entry))).toBe(true);
  });

  it("records use at most once a minute", async () => {
    let time = 0;
    const { state, storage } = memoryStorage();
    const store = createApiTokenStore(storage, () => time);
    const { token } = await store.create("Script", ["search"]);

    time = 5000;
    await store.authenticate(token);
    await settle();
    time = 30_000;
    await store.authenticate(token);
    await settle();
    expect(state.writes).toBe(2);
    expect((await store.list())[0]?.lastUsedAt).toBe(5000);

    time = 70_000;
    await store.authenticate(token);
    await settle();
    expect((await store.list())[0]?.lastUsedAt).toBe(70_000);
  });

  it("starts empty when the stored list is unreadable", async () => {
    const store = createApiTokenStore(memoryStorage("{not json").storage);
    expect(await store.list()).toEqual([]);
  });
});

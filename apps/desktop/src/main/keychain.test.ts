import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createKeychain,
  type KeychainPort,
  KeychainUnavailableError,
} from "./keychain";

let userData = "";
let port: TestKeychainPort;
let keychain: ReturnType<typeof createKeychain>;

class TestKeychainPort implements KeychainPort {
  platform: NodeJS.Platform = "linux";
  encryptionEnabled = true;
  decryptionEnabled = true;

  constructor(private readonly directory: string) {}

  userDataPath(): string {
    return this.directory;
  }

  encryptionAvailable(): boolean {
    return this.encryptionEnabled;
  }

  protect(value: string): Buffer {
    if (!this.encryptionEnabled) throw new Error("Encryption unavailable.");
    return Buffer.from(`protected:${value}`, "utf8");
  }

  unprotect(value: Buffer): string {
    if (!this.decryptionEnabled) throw new Error("Decryption unavailable.");
    const protectedValue = value.toString("utf8");
    if (!protectedValue.startsWith("protected:"))
      throw new Error("Invalid protected value.");
    return protectedValue.slice("protected:".length);
  }
}

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), "pond-keychain-"));
  port = new TestKeychainPort(userData);
  keychain = createKeychain(port);
});

afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
});

describe("secrets", () => {
  it("stores secrets protected by the operating system", async () => {
    await keychain.setSecret("agent:test", "sk-test");

    expect(await keychain.getSecret("agent:test")).toBe("sk-test");
    expect(
      await readFile(join(userData, "secrets.json"), "utf8"),
    ).not.toContain(Buffer.from("sk-test").toString("base64"));
  });

  it("falls back to tagged plaintext when protection is unavailable", async () => {
    port.encryptionEnabled = false;
    await keychain.setSecret("agent:test", "sk-test");

    expect(await keychain.getSecret("agent:test")).toBe("sk-test");
  });

  it("returns null for a protected secret that cannot be decrypted", async () => {
    await keychain.setSecret("agent:test", "sk-test");
    port.decryptionEnabled = false;

    expect(await keychain.getSecret("agent:test")).toBeNull();
  });

  it("refuses to persist plaintext on Windows and leaves the file untouched", async () => {
    await keychain.setSecret("agent:other", "sk-other");
    const before = await readFile(join(userData, "secrets.json"), "utf8");
    port.platform = "win32";
    port.encryptionEnabled = false;

    await expect(keychain.setSecret("agent:test", "sk-test")).rejects.toThrow(
      KeychainUnavailableError,
    );

    expect(await readFile(join(userData, "secrets.json"), "utf8")).toBe(before);
    expect(await readdir(userData)).toEqual(["secrets.json"]);
  });

  it("does not create a secrets file on Windows without encryption", async () => {
    port.platform = "win32";
    port.encryptionEnabled = false;
    await expect(keychain.setSecret("agent:test", "sk-test")).rejects.toThrow(
      "not saved",
    );
    expect(await readdir(userData)).toEqual([]);
  });

  it("still reads a legacy raw: secret on Windows", async () => {
    await writeFile(
      join(userData, "secrets.json"),
      JSON.stringify({
        "so.pond.desktop:agent:test": `raw:${Buffer.from("sk-legacy").toString("base64")}`,
      }),
    );
    port.platform = "win32";
    port.encryptionEnabled = false;
    expect(await keychain.getSecret("agent:test")).toBe("sk-legacy");
  });
});

describe("unreadable entries", () => {
  it("keeps an undecryptable entry byte-for-byte when siblings change", async () => {
    await keychain.setSecret("agent:a", "sk-a");
    port.decryptionEnabled = false;
    const file = join(userData, "secrets.json");
    const before = JSON.parse(await readFile(file, "utf8"));

    await keychain.setSecret("agent:b", "sk-b");
    await keychain.deleteSecret("agent:b");

    expect(await keychain.getSecret("agent:a")).toBeNull();
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(before);
  });

  it("mints a new ingest token when the stored one cannot be decrypted, keeping other entries", async () => {
    await keychain.setSecret("agent:a", "sk-a");
    const token = await keychain.ensureIngestToken();
    const file = join(userData, "secrets.json");
    const before = JSON.parse(await readFile(file, "utf8"));
    port.decryptionEnabled = false;

    const replacement = await keychain.ensureIngestToken();

    port.decryptionEnabled = true;
    expect(replacement).not.toBe(token);
    expect(await keychain.getIngestToken()).toBe(replacement);
    const after = JSON.parse(await readFile(file, "utf8"));
    expect(after["so.pond.desktop:agent:a"]).toBe(
      before["so.pond.desktop:agent:a"],
    );
  });

  it("never persists a plaintext ingest token on Windows without encryption", async () => {
    port.platform = "win32";
    port.encryptionEnabled = false;

    await expect(keychain.ensureIngestToken()).rejects.toThrow(
      KeychainUnavailableError,
    );
    expect(await readdir(userData)).not.toContain("secrets.json");
  });

  it("sets a damaged secrets file aside instead of overwriting it", async () => {
    await writeFile(join(userData, "secrets.json"), "{not json");

    await keychain.setSecret("agent:test", "sk-test");

    expect(await keychain.getSecret("agent:test")).toBe("sk-test");
    const names = await readdir(userData);
    const aside = names.find((name) => name.includes(".damaged-"));
    expect(aside).toBeDefined();
    expect(await readFile(join(userData, aside ?? ""), "utf8")).toBe(
      "{not json",
    );
  });

  it("applies concurrent updates without losing entries", async () => {
    await Promise.all(
      ["a", "b", "c", "d"].map((key) =>
        keychain.setSecret(`agent:${key}`, `sk-${key}`),
      ),
    );
    expect(
      await keychain.getSecrets(["agent:a", "agent:b", "agent:c", "agent:d"]),
    ).toEqual({
      "agent:a": "sk-a",
      "agent:b": "sk-b",
      "agent:c": "sk-c",
      "agent:d": "sk-d",
    });
  });
});

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { net } from "electron";
import log from "electron-log/main.js";

const execAsync = promisify(exec);

const CACHE_TTL_MS = 15_000;

interface CacheEntry {
  value: boolean | null;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

export async function isOnWifi(): Promise<boolean | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  const value = await detect();
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function clearNetworkTypeCache(): void {
  cache = null;
}

async function detect(): Promise<boolean | null> {
  if (!net.isOnline()) return false;

  try {
    switch (process.platform) {
      case "darwin":
        return await detectMac();
      case "linux":
        return await detectLinux();
      default:
        return null;
    }
  } catch (err) {
    log.warn("[pond network-type] detection failed", err);
    return null;
  }
}

async function detectMac(): Promise<boolean | null> {
  const iface = await defaultInterfaceMac();
  if (!iface) return null;

  const { stdout } = await execAsync("networksetup -listallhardwareports", {
    timeout: 2_000,
  });

  const lines = stdout.split("\n");
  let currentPort: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("Hardware Port:")) {
      currentPort = line.slice("Hardware Port:".length).trim();
    } else if (line.startsWith("Device:")) {
      const device = line.slice("Device:".length).trim();
      if (device === iface && currentPort) {
        return currentPort.toLowerCase() === "wi-fi";
      }
    }
  }
  return null;
}

async function defaultInterfaceMac(): Promise<string | null> {
  const { stdout } = await execAsync("route -n get default", {
    timeout: 2_000,
  });
  const match = /interface:\s*(\S+)/.exec(stdout);
  return match?.[1] ?? null;
}

async function detectLinux(): Promise<boolean | null> {
  try {
    const { stdout } = await execAsync(
      "nmcli -t -f TYPE,STATE connection show --active",
      { timeout: 2_000 },
    );
    let sawActive = false;
    for (const raw of stdout.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const [type, state] = line.split(":");
      if (state !== "activated") continue;
      sawActive = true;
      if (type === "wifi" || type === "802-11-wireless") return true;
    }
    return sawActive ? false : null;
  } catch {
    return null;
  }
}

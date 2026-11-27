import type { ShareHostSummary } from "../../../shared/share-link-contracts";
import { deleteSecret, getSecret, setSecret } from "../../keychain";
import { ShareHostConfigSchema } from "./host";
import type { ShareHostConfig } from "./host";

/** One Share Host per computer, kept whole in the keychain: the secret never touches a plain file. */
const ACCOUNT = "share-host";

export async function readShareHostConfig(): Promise<ShareHostConfig | null> {
  const stored = await getSecret(ACCOUNT);
  if (!stored) return null;
  try {
    const parsed = ShareHostConfigSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeShareHostConfig(
  config: ShareHostConfig,
): Promise<void> {
  await setSecret(ACCOUNT, JSON.stringify(config));
}

export async function removeShareHostConfig(): Promise<void> {
  await deleteSecret(ACCOUNT);
}

export function summarizeShareHost(config: ShareHostConfig): ShareHostSummary {
  const { secretAccessKey: _secret, ...summary } = config;
  return summary;
}

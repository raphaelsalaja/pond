import { deleteSecret, getSecret, setSecret } from "../../keychain";
import { type MymindCredential, MymindCredentialSchema } from "./client";

const credentialKey = (accountId: string) => `mymind:${accountId}`;

export async function readMymindCredential(
  accountId: string,
): Promise<MymindCredential | null> {
  const stored = await getSecret(credentialKey(accountId));
  if (!stored) return null;
  try {
    const result = MymindCredentialSchema.safeParse(JSON.parse(stored));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeMymindCredential(
  accountId: string,
  credential: MymindCredential,
): Promise<void> {
  await setSecret(credentialKey(accountId), JSON.stringify(credential));
}

export async function removeMymindCredential(accountId: string): Promise<void> {
  await deleteSecret(credentialKey(accountId));
}

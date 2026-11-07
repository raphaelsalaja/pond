import { acquire, report } from "../pipeline/rate-governor";
import { createMymindClient, type MymindCredential } from "./client";

export function createConnectedMymindClient(
  credential: MymindCredential,
): ReturnType<typeof createMymindClient> {
  return createMymindClient(credential, {
    beforeRequest: (signal) => acquire("mymind", { signal }),
    fetch: async (url, options) => {
      const response = await fetch(url, options);
      report("mymind", {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
      });
      return response;
    },
  });
}

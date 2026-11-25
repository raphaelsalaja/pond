import type { QueryResult } from "../../../shared/query-contracts";
import type { QueryHandlerMap } from "./params";

export const safariExtensionQueries = {
  async "extension.safariStatus"(): Promise<
    QueryResult<"extension.safariStatus">
  > {
    const { safariExtensionStatus } =
      await import("../../core/safari-extension");
    return safariExtensionStatus();
  },

  async "extension.openSafariSettings"(): Promise<
    QueryResult<"extension.openSafariSettings">
  > {
    const { openSafariSettings, safariExtensionStatus } =
      await import("../../core/safari-extension");
    /** Re-read first so the helper is told about the appex in *this* build. */
    return openSafariSettings(await safariExtensionStatus());
  },

  async "extension.openSafari"(): Promise<QueryResult<"extension.openSafari">> {
    const { openSafari } = await import("../../core/safari-extension");
    return openSafari();
  },
} satisfies QueryHandlerMap;

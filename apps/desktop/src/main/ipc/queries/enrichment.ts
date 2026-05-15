import type { QueryHandlerMap } from "../helpers";

export const enrichmentQueries: QueryHandlerMap = {
  async "enrich.start"(params) {
    const { startEnrich } = await import("../../core/enrich");
    const id = params.saveId ? String(params.saveId) : null;
    return await startEnrich(id);
  },

  async "enrich.backfill"() {
    const { enqueueBackfill } = await import("../../core/enrich");
    return await enqueueBackfill();
  },

  async "enrich.status"() {
    const { enrichStatus } = await import("../../core/enrich");
    return await enrichStatus();
  },

  async "enrich.applySuggestion"(params) {
    const { applyAiSuggestion } = await import("../../core/enrich");
    const id = String(params.saveId ?? "");
    const field = String(params.field ?? "") as
      | "tags"
      | "caption"
      | "ocr"
      | "classification"
      | "summary";
    const accept = Boolean(params.accept ?? true);
    return await applyAiSuggestion(id, field, accept);
  },
};

import { ApiSearchRequestSchema } from "@pond/schema/api";
import { Hono } from "hono";
import {
  ConversionApiRequestSchema,
  ConversionPresetSchema,
  ImageCompressionRequestSchema,
  VideoCompressionRequestSchema,
} from "../../shared/conversion-contracts";
import { LibraryQueryRequestSchema } from "../../shared/library-query";
import { queryActiveLibraryPage } from "../core/active-library-query";
import { conversionCapabilities } from "../core/conversion-capabilities";
import {
  conversionJobs,
  conversionPresets,
  saveConversionPreset,
} from "../core/conversion-jobs";
import { libraryInfo } from "../ops";
import {
  libraryFolders,
  librarySources,
  libraryTags,
  libraryViews,
  searchSaves,
} from "./api-library";
import { apiRuntime } from "./api-runtime";
import type { ApiRuntime } from "./api-runtime";
import { apiSavesByIds } from "./api-saves";
import { handleApiError, invalidRequest } from "./errors";

export function libraryRoutes(runtime: ApiRuntime = apiRuntime) {
  const routes = new Hono();
  routes.get("/conversion/capabilities", async (c) =>
    c.json({ status: "success", data: await conversionCapabilities() }),
  );
  routes.get("/conversion/presets", (c) =>
    c.json({ status: "success", data: conversionPresets() }),
  );
  routes.post("/conversion/presets", async (c) => {
    const parsed = ConversionPresetSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    return c.json({
      status: "success",
      data: saveConversionPreset(parsed.data),
    });
  });
  routes.post("/conversion/start", async (c) => {
    const parsed = ConversionApiRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    return c.json({
      status: "success",
      data: conversionJobs.start(parsed.data),
    });
  });
  routes.post("/conversion/compress", async (c) => {
    const parsed = ImageCompressionRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    return c.json({
      status: "success",
      data: conversionJobs.startCompression(parsed.data),
    });
  });
  routes.post("/conversion/compress-videos", async (c) => {
    const parsed = VideoCompressionRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    return c.json({
      status: "success",
      data: conversionJobs.startVideoCompression(parsed.data),
    });
  });
  routes.get("/conversion/:id", (c) =>
    c.json({
      status: "success",
      data: conversionJobs.status(c.req.param("id")),
    }),
  );
  routes.post("/conversion/:id/cancel", (c) =>
    c.json({
      status: "success",
      data: conversionJobs.cancel(c.req.param("id")),
    }),
  );
  routes.post("/query", async (c) => {
    const parsed = LibraryQueryRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    const page = await queryActiveLibraryPage(parsed.data);
    const data = parsed.data.include?.includes("saves")
      ? {
          ...page,
          saves: await apiSavesByIds(runtime, page.ids, {
            includeDeleted: true,
          }),
        }
      : page;
    return c.json({ status: "success", data });
  });
  routes.get("/info", async (c) =>
    c.json({ status: "success", data: await libraryInfo() }),
  );
  routes.get("/tags", async (c) =>
    c.json({ status: "success", data: await libraryTags(runtime) }),
  );
  routes.get("/folders", async (c) =>
    c.json({ status: "success", data: await libraryFolders(runtime) }),
  );
  routes.get("/views", async (c) =>
    c.json({ status: "success", data: await libraryViews() }),
  );
  routes.get("/sources", async (c) =>
    c.json({ status: "success", data: await librarySources(runtime) }),
  );
  routes.post("/search", async (c) => {
    const parsed = ApiSearchRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    return c.json({
      status: "success",
      data: await searchSaves(runtime, parsed.data),
    });
  });
  routes.onError(handleApiError);
  return routes;
}

import { expect, it } from "vitest";
import { libraryLocationRoutes } from "./library-locations";

const library = {
  path: "/Libraries/Design.pond",
  name: "Design",
  active: false,
  available: true,
  lastOpened: 1,
  icon: null,
  accent: null,
};

it("lists recent Libraries", async () => {
  const routes = libraryLocationRoutes({
    recent: async () => [library],
    switchTo: async (path) => ({ ok: true, path, mode: "adopt" }),
  });

  const response = await routes.request("/recent");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "success",
    data: [library],
  });
});

it("switches to a validated recent Library path", async () => {
  const switched: Array<string> = [];
  const routes = libraryLocationRoutes({
    recent: async () => [library],
    switchTo: async (path) => {
      switched.push(path);
      return { ok: true, path, mode: "adopt" };
    },
  });

  const response = await routes.request("/switch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: library.path }),
  });

  expect(response.status).toBe(200);
  expect(switched).toEqual([library.path]);
});

it("returns switch failures without claiming success", async () => {
  const routes = libraryLocationRoutes({
    recent: async () => [library],
    switchTo: async () => ({ ok: false, error: "Library not found." }),
  });

  const response = await routes.request("/switch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: library.path }),
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    status: "error",
    error: { code: "library_unavailable", message: "Library not found." },
  });
});

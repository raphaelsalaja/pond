import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const COMPOSE_FROM = /composes:[^;]*?from\s+["']([^"']+)["']/g;

/** Vite inlines CSS Modules `composes` and drops the graph edge, so HMR would miss composer stylesheets. */
export function cssComposesHmr(watchDirs: Array<string> = []): Plugin {
  const composers = new Map<string, Set<string>>();

  return {
    name: "pond:css-composes-hmr",
    enforce: "pre",
    configureServer(server) {
      for (const dir of watchDirs) server.watcher.add(dir);
    },
    transform(code, id) {
      if (id.includes("?raw") || id.includes("&raw")) return;
      const file = id.split("?")[0];
      if (!file?.endsWith(".module.css")) return;
      COMPOSE_FROM.lastIndex = 0;
      for (const match of code.matchAll(COMPOSE_FROM)) {
        const from = match[1];
        if (!from) continue;
        const dep = resolve(dirname(file), from);
        this.addWatchFile(dep);
        let importers = composers.get(dep);
        if (!importers) {
          importers = new Set();
          composers.set(dep, importers);
        }
        importers.add(file);
      }
    },
    handleHotUpdate({ file, server, modules }) {
      const importers = composers.get(file);
      if (!importers?.size) return;
      const extra = [...modules];
      for (const importer of importers) {
        const nodes = server.moduleGraph.getModulesByFile(importer);
        if (!nodes) continue;
        for (const node of nodes) {
          const id = node.id?.split("?")[0] ?? "";
          if (!id.endsWith(".module.css")) continue;
          server.moduleGraph.invalidateModule(node);
          extra.push(node);
        }
      }
      return extra;
    },
  };
}

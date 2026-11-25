/** Safari names the context-menu API `menus`, and WXT's polyfill does not alias `contextMenus` there. */
type MenuNamespace = typeof browser.contextMenus;

interface MenuHosts<T> {
  contextMenus?: T;
  menus?: T;
}

export function resolveMenus<T>(runtime: MenuHosts<T> | undefined): T {
  const menus = runtime?.contextMenus ?? runtime?.menus;
  if (!menus) {
    throw new Error("No context-menu API in this browser.");
  }
  return menus;
}

/** SAFETY: both names come from the browser's own extension API and share one shape. */
const runtime = globalThis.browser as MenuHosts<MenuNamespace> | undefined;

export const contextMenus: MenuNamespace = resolveMenus(runtime);

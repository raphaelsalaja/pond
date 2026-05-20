import {
  createPanePrefStore,
  type PanePref,
  usePanePref,
} from "@/lib/use-pane-pref";

const store = createPanePrefStore("sidebar", { defaultOpen: true });

export function useSidebar(): PanePref {
  return usePanePref(store);
}

export const readSidebarPref = store.read;
export const setSidebarOpen = store.set;
export const toggleSidebar = store.toggle;

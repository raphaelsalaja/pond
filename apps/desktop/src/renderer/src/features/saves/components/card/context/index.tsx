import { createContext, type ReactNode, use } from "react";

interface LibraryCardCallbacks {
  onClick: (id: string, e: React.MouseEvent) => void;
  onAuxClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  /** Cards show a selection circle only when the collection can select. */
  onPick?: (id: string, e: React.MouseEvent) => void;
}

const CallbacksContext = createContext<LibraryCardCallbacks | null>(null);

export function useLibraryCardCallbacks(): LibraryCardCallbacks {
  const ctx = use(CallbacksContext);
  if (!ctx) {
    throw new Error("SaveCard must be rendered inside <LayoutSwitcher>");
  }
  return ctx;
}

const MultiSelectContext = createContext(false);

export function useMultiSelectActive(): boolean {
  return use(MultiSelectContext);
}

interface ProviderProps {
  callbacks: LibraryCardCallbacks;
  multiSelectActive: boolean;
  children: ReactNode;
}

export function LibraryGridProvider({
  callbacks,
  multiSelectActive,
  children,
}: ProviderProps) {
  return (
    <CallbacksContext value={callbacks}>
      <MultiSelectContext value={multiSelectActive}>
        {children}
      </MultiSelectContext>
    </CallbacksContext>
  );
}

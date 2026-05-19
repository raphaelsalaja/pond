import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTabStore } from "@/stores/tabs";

interface TabNavigateOptions {
  viewTransition?: boolean;
}

export function useTabNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (path: string, opts?: TabNavigateOptions & { openInNewTab?: boolean }) => {
      if (opts?.openInNewTab) {
        useTabStore.getState().open(path, { background: true });
      } else {
        navigate(path, { viewTransition: opts?.viewTransition });
      }
    },
    [navigate],
  );
}

export function openInNewTabIfMeta(
  e: React.MouseEvent | MouseEvent,
  path: string,
  fallback: () => void,
): void {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
    useTabStore.getState().open(path, { background: true });
  } else {
    fallback();
  }
}

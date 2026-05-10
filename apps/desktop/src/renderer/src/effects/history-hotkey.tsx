import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Browser-back / forward bound to `Cmd+[` and `Cmd+]`. Linear's
 * sidebar doesn't show visible back/forward buttons — back/forward
 * comes from the browser. We keep the keyboard hotkey for users who
 * relied on the old visible arrows.
 */
export function HistoryHotkey() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "[") {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === "]") {
        e.preventDefault();
        navigate(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return null;
}

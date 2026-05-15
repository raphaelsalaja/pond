import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

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

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function PreferencesHotkey() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key !== ",") return;
      e.preventDefault();
      navigate("/settings", { viewTransition: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return null;
}

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function DeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const off = window.pond.onNavigate((path) =>
      navigate(path, { viewTransition: true }),
    );
    return off;
  }, [navigate]);

  return null;
}

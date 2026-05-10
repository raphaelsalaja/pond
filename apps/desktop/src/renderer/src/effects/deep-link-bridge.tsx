import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Forwards `pond://` deep links and tray-menu navigation requests from
 * main to react-router. Main owns the URL → path translation; we just
 * push whatever path it hands us.
 */
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

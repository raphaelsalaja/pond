import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * First-run redirect to `/welcome`. We wait for the onboarded flag to
 * resolve before doing anything — the IPC call is async and we can't
 * tell "not onboarded" from "still loading" otherwise.
 */
export function OnboardedGuard() {
  const navigate = useNavigate();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void window.pond.query("settings.onboarded").then((v) => {
      setOnboarded(Boolean(v));
    });
  }, []);

  useEffect(() => {
    if (onboarded === false) navigate("/welcome", { replace: true });
  }, [onboarded, navigate]);

  return null;
}

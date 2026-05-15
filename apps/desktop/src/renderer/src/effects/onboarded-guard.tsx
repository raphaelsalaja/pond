import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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

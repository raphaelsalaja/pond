import { Input } from "@pond/ui";
import { useId, useState } from "react";
import { savePrefsSection, usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export function SystemPreferences() {
  const id = useId();
  const [prefs] = usePrefs("system");
  const [proxyUrl, setProxyUrl] = useState(prefs.proxyUrl);
  return (
    <label className={styles.field} htmlFor={id}>
      Proxy URL
      <Input.Root>
        <Input.Field
          id={id}
          value={proxyUrl}
          placeholder="http://127.0.0.1:8080"
          onValueChange={setProxyUrl}
          onBlur={() => {
            void savePrefsSection("system", { proxyUrl }).then(() =>
              window.pond.query("system.applyPrefs", {}),
            );
          }}
        />
      </Input.Root>
      <span>An HTTP or SOCKS address for Pond&apos;s requests.</span>
    </label>
  );
}

import { Button } from "@pond/ui";
import { openSettings } from "@/shared/lib/open-settings";
import { ErrorNotice } from "../../error-notice";
import styles from "./styles.module.css";

const OPENAI_BILLING_URL =
  "https://platform.openai.com/settings/organization/billing/";

export interface ResponseErrorCopy {
  title: string;
  description: string;
  action?: { label: string; url: string } | { label: string; settings: true };
}

const OPEN_PROVIDERS = { label: "Open Providers", settings: true } as const;

export function responseErrorCopy(error: string): ResponseErrorCopy {
  if (/no credits remaining|insufficient_quota/i.test(error)) {
    const copy: ResponseErrorCopy = {
      title: "No API credits remaining",
      description:
        "Add credits in your provider's billing settings, then try again.",
    };
    if (error.includes("platform.openai.com")) {
      copy.action = { label: "Open Billing", url: OPENAI_BILLING_URL };
    }
    return copy;
  }
  if (/rate limit|too many requests/i.test(error)) {
    return {
      title: "The model is rate limited",
      description: "Wait a moment, then try again.",
    };
  }
  if (/invalid api key|incorrect api key|authentication/i.test(error)) {
    return {
      title: "Couldn't authenticate with the model provider",
      description: "Check your API key in Providers, then try again.",
      action: OPEN_PROVIDERS,
    };
  }
  return {
    title: "Couldn't finish this response",
    description: "Check your provider in Providers, then try again.",
    action: OPEN_PROVIDERS,
  };
}

export function ResponseError({ error }: { error: string }) {
  const copy = responseErrorCopy(error);
  const action = copy.action;
  return (
    <ErrorNotice
      className={styles.notice}
      title={copy.title}
      actions={
        action ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              "url" in action
                ? void window.pond.openExternal(action.url)
                : openSettings("models")
            }
          >
            {action.label}
          </Button>
        ) : null
      }
    >
      {copy.description}
    </ErrorNotice>
  );
}

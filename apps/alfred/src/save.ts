import { curlCommand, failureFor } from "./api";
import { request } from "./jxa";

/** Output becomes the notification text in the workflow's Post Notification object. */
export function run(argv: Array<string>): string {
  const url = (argv[0] ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return "Pond saves web links";
  }
  const result = request(
    curlCommand("/enqueue", { url, trigger: "alfred:save" }),
  );
  if (!result) {
    return "Open Pond, then try again";
  }
  const failure = failureFor(result);
  if (failure === "unauthorized") {
    return "Pond didn't accept the token";
  }
  if (failure === "forbidden") {
    return "The token can't save";
  }
  if (failure) {
    return "Pond can't save that link";
  }
  return "Saved to Pond";
}

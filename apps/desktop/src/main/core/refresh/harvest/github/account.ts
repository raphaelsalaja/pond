import { session } from "electron";
import log from "electron-log/main.js";
import { PARTITION } from "../../harvest-window/constants";

interface SessionCookie {
  name: string;
  value: string;
}

/** github.com sets `dotcom_user` beside `user_session`, and `logged_in=yes` only while signed in. */
export function loginFromCookies(
  cookies: ReadonlyArray<SessionCookie>,
): string | null {
  const signedIn = cookies.some(
    (cookie) => cookie.name === "logged_in" && cookie.value === "yes",
  );
  const login = cookies.find((cookie) => cookie.name === "dotcom_user")?.value;
  return signedIn && login ? decodeURIComponent(login) : null;
}

export async function probeGithubHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  try {
    const cookies = await session
      .fromPartition(partition)
      .cookies.get({ url: "https://github.com" });
    return loginFromCookies(cookies);
  } catch (error) {
    log.warn("[pond github] cookie read failed", error);
    return null;
  }
}

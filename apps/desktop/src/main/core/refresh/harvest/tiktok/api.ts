import { session } from "electron";
import log from "electron-log/main.js";
import { PARTITION } from "../../harvest-window/constants";
import { uniqueIdFromTiktokHtml } from "./listing";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HOME_URL = "https://www.tiktok.com/";

export async function probeTiktokHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  const ses = session.fromPartition(partition);
  ses.setUserAgent(CHROME_UA);
  let res: Response;
  try {
    res = await ses.fetch(HOME_URL, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": CHROME_UA,
      },
    });
  } catch (error) {
    log.warn("[pond tiktok-api] homepage fetch threw", error);
    return null;
  }
  const html = await res.text();
  const handle = uniqueIdFromTiktokHtml(html);
  if (handle) {
    log.info("[pond tiktok-api] probed handle", handle);
    return handle;
  }
  if (!res.ok) {
    log.warn("[pond tiktok-api] homepage fetch failed", res.status);
  }
  return null;
}

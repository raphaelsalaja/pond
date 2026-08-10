import {
  getMediaIndexStatus,
  pauseMediaIndex,
  resumeMediaIndex,
  startMediaIndex,
} from "../../core/media-warm/service";
import type { QueryHandlerMap } from "../helpers";

export const mediaIndexQueries: QueryHandlerMap = {
  "mediaIndex.status"() {
    return getMediaIndexStatus();
  },
  "mediaIndex.start"() {
    return startMediaIndex({ manual: true });
  },
  "mediaIndex.pause"() {
    return pauseMediaIndex();
  },
  "mediaIndex.resume"() {
    return resumeMediaIndex();
  },
};

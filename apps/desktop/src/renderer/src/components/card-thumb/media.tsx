import { Image } from "./image";
import { Placeholder } from "./placeholder";
import { Tweet } from "./tweet";
import { Video } from "./video";

/** Sugar for the full media stack — image / video / text-tweet card / placeholder. */
export function Media() {
  return (
    <>
      <Image />
      <Video />
      <Tweet />
      <Placeholder />
    </>
  );
}

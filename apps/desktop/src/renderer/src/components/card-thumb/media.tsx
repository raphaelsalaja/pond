import { Image } from "./image";
import { Placeholder } from "./placeholder";
import { Tweet } from "./tweet";
import { Video } from "./video";

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

import { getLatestRelease } from "@/lib/release";
import { Film } from "./components/film";
import { Intro } from "./components/intro";
import { Sounds } from "./components/sounds";
import { Splash } from "./components/splash";

export default async function Page() {
  const release = await getLatestRelease();
  return (
    <>
      <Splash />
      <Sounds />
      <main>
        <Intro release={release} />
        <Film />
      </main>
    </>
  );
}

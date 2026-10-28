import { Bento } from "./components/home/bento";
import { Folder } from "./components/home/folder";
import { Hero } from "./components/home/hero";

export default function Page() {
  return (
    <main>
      <Hero />
      <Bento />
      <Folder />
    </main>
  );
}

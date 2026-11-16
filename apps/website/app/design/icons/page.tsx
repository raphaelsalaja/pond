import type { Metadata } from "next";
import { Icons } from "../components/icons";

export const metadata: Metadata = {
  title: "Icons",
};

export default function IconsPage() {
  return <Icons />;
}

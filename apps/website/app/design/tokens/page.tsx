import type { Metadata } from "next";
import { Tokens } from "../components/tokens";

export const metadata: Metadata = {
  title: "Tokens",
};

export default function TokensPage() {
  return <Tokens />;
}

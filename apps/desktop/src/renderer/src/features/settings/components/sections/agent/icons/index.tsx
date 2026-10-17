import type { AssistantProvider } from "@shared/assistant";
import anthropic from "@/assets/logos/providers/anthropic.webp";
import azure from "@/assets/logos/providers/azure.webp";
import baseten from "@/assets/logos/providers/baseten.webp";
import cerebras from "@/assets/logos/providers/cerebras.webp";
import cohere from "@/assets/logos/providers/cohere.webp";
import deepinfra from "@/assets/logos/providers/deepinfra.webp";
import deepseek from "@/assets/logos/providers/deepseek.webp";
import fireworks from "@/assets/logos/providers/fireworks.webp";
import google from "@/assets/logos/providers/google.webp";
import groq from "@/assets/logos/providers/groq.webp";
import lmstudio from "@/assets/logos/providers/lmstudio.webp";
import mistral from "@/assets/logos/providers/mistral.webp";
import ollama from "@/assets/logos/providers/ollama.webp";
import openai from "@/assets/logos/providers/openai.webp";
import opencodeGo from "@/assets/logos/providers/opencode-go.webp";
import openrouter from "@/assets/logos/providers/openrouter.webp";
import perplexity from "@/assets/logos/providers/perplexity.webp";
import sapient from "@/assets/logos/providers/sapient.webp";
import together from "@/assets/logos/providers/together.webp";
import xai from "@/assets/logos/providers/xai.webp";
import styles from "./styles.module.css";

const logos = {
  codex: openai,
  "claude-code": anthropic,
  anthropic,
  openai,
  gemini: google,
  xai,
  azure,
  mistral,
  groq,
  cohere,
  togetherai: together,
  fireworks,
  deepinfra,
  cerebras,
  perplexity,
  baseten,
  deepseek,
  "opencode-go": opencodeGo,
  openrouter,
  ollama,
  lmstudio,
  sapient,
} satisfies Record<AssistantProvider, string>;

export function ProviderLogo({
  provider,
  size = 18,
}: {
  provider: AssistantProvider;
  size?: number;
}) {
  const logo = logos[provider];
  return (
    <img src={logo} alt="" width={size} height={size} className={styles.logo} />
  );
}

import { Input, Settings } from "@pond/ui";
import { useId, useState } from "react";
import { z } from "zod";
import { ProcessingStatus } from "@/features/settings/components/sections/processing";
import { defineSection } from "@/features/settings/lib/engine-types";
import type { Binding } from "@/features/settings/lib/engine-types";

function MediaModelIdControl({ binding }: { binding: Binding }) {
  const titleId = useId();
  const descriptionId = useId();
  const modelId = z
    .string()
    .catch("")
    .parse(binding.values.mediaUnderstandingModelId);
  const [draft, setDraft] = useState(modelId);
  const [syncedModelId, setSyncedModelId] = useState(modelId);
  if (syncedModelId !== modelId) {
    setSyncedModelId(modelId);
    setDraft(modelId);
  }
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle id={titleId}>Local Model</Settings.ItemTitle>
        <Settings.ItemDescription id={descriptionId}>
          Paste the model name as Ollama or LM Studio lists it.
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Input.Root size="sm">
          <Input.Field
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            disabled={!binding.loaded}
            value={draft}
            onValueChange={setDraft}
            onBlur={() => {
              const value = draft.trim();
              if (value && value !== modelId) {
                void binding.patch({ mediaUnderstandingModelId: value });
              }
            }}
            style={{ width: 160 }}
          />
        </Input.Root>
      </Settings.ItemControl>
    </>
  );
}

export const processingSection = defineSection("ai", {
  title: "Processing",
  description: "Choose which on-device details Pond adds to your saves.",
  keywords: [
    "processing",
    "caption",
    "ocr",
    "transcript",
    "clip",
    "sensitive",
    "nsfw",
    "enrichment",
    "search",
    "semantic",
  ],
  groups: [
    { title: "Processing Status", render: () => <ProcessingStatus /> },
    {
      title: "Search",
      items: [
        {
          control: "switch",
          key: "semanticSearch",
          title: "Semantic Search",
          description: "Ranks Saves by meaning, including unlabeled photos.",
          keywords: ["embeddings", "meaning", "vector", "similarity"],
        },
      ],
    },
    {
      title: "Image Understanding",
      items: [
        {
          control: "select",
          key: "mediaUnderstandingMode",
          title: "Image Understanding",
          description: "Adds captions and reads text.",
          keywords: ["gemma", "florence", "vision", "benchmark"],
          options: [
            { value: "florence", label: "Built-In Model" },
            { value: "gemma4", label: "Local Runtime Model" },
          ],
        },
        {
          control: "select",
          key: "mediaUnderstandingProvider",
          title: "Local Runtime",
          description: "Choose the app that runs the local model.",
          keywords: ["ollama", "lm studio", "local", "runtime"],
          options: [
            { value: "ollama", label: "Ollama" },
            { value: "lmstudio", label: "LM Studio" },
          ],
          visible: (v) => v.mediaUnderstandingMode !== "florence",
        },
        {
          control: "custom",
          key: "media-understanding-model-id",
          title: "Local Model",
          keywords: ["gemma", "model", "name", "id", "installed", "e2b", "e4b"],
          visible: (v) => v.mediaUnderstandingMode !== "florence",
          render: (binding) => <MediaModelIdControl binding={binding} />,
        },
      ],
    },
    {
      title: "Details",
      items: [
        {
          control: "switch",
          key: "enableCaption",
          title: "Image Captions",
          description: "Describe images after a large one-time download.",
          keywords: ["florence", "vision", "describe"],
        },
        {
          control: "switch",
          key: "enableOcr",
          title: "Text in Images",
          description: "Make text in screenshots and photos searchable.",
          keywords: ["ocr", "recognition", "florence"],
        },
        {
          control: "switch",
          key: "enableTranscript",
          title: "Transcription",
          description: "Transcribe video and audio.",
          keywords: ["whisper", "speech", "captions", "subtitles"],
        },
        {
          control: "switch",
          key: "enableClip",
          title: "Visual Similarity",
          description: "Match a Save or a dropped picture.",
          keywords: ["clip", "embeddings", "look alike", "visual match"],
        },
        {
          control: "switch",
          key: "enableAesthetic",
          title: "Style Labels",
          description: "Label styles like minimalist or vintage.",
          keywords: ["style", "aesthetic", "labels", "clip"],
          disabled: (v) => v.enableClip !== true,
        },
        {
          control: "switch",
          key: "enableSensitiveContent",
          title: "Sensitive Content",
          description: "Images and sampled video, on your device.",
          keywords: ["sensitive", "nsfw", "safety", "blur"],
        },
        {
          control: "switch",
          key: "blurSensitiveThumbnails",
          title: "Blur Sensitive Thumbnails",
          description: "Blur thumbnails with a likely-sensitive result.",
          keywords: ["sensitive", "nsfw", "blur", "thumbnail"],
          disabled: (v) => v.enableSensitiveContent !== true,
        },
        {
          control: "switch",
          key: "enableAutoTitle",
          title: "Generated Titles",
          description: "Fill empty titles without overwriting your edits.",
          keywords: ["title", "automatic", "naming"],
          disabled: (v) => v.enableCaption !== true && v.enableOcr !== true,
        },
        {
          control: "switch",
          key: "enableSuggestedTags",
          title: "Suggested Tags",
          description: "Suggest tags from your library for you to apply.",
          keywords: ["tags", "suggestions", "auto-tag"],
          disabled: (v) => v.semanticSearch !== true,
        },
      ],
    },
  ],
});

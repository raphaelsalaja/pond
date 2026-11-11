/** Media derivation without Save UI, for enrichers and the Agent pane. */

export { saveDuration } from "./lib/duration";
export {
  buildOriginalMediaUnits,
  deriveTypeKind,
  type MediaUnit,
  pickCardUnit,
  pickPrimaryFile,
  pickPrimaryUnit,
} from "./lib/media/units";
export { buildPondUrl, previewThumbUrlFor, thumbUrlFor } from "./lib/media/url";
export { shouldBlurSensitiveThumbnail } from "./lib/sensitive-content";
export {
  aspectFor,
  clampRatio,
  layoutAspectFor,
  useAspectVersion,
} from "./state/aspect";

// Public engine surface — the ONLY import surface for cli/extension.
// Never deep-import core/* from outside; add new slices here as they land.

export { getDiffPreview, resolveSha, getCommitPayload, truncateDiff, shapeDiffForJudge } from "./core/git/index.js";
export { JevSignificanceJudge, judgeSignificance } from "./core/significance/index.js";
export type { SignificanceInput, SignificanceResult, SignificanceJudge } from "./core/significance/index.js";
export {
  getTractHome,
  getRepoSlug,
  ensureTractHome,
  loadConfig,
  saveMeta,
  hashDiff,
  DEFAULT_CONFIG,
  VOICE_FILES,
} from "./core/store/index.js";
export type { TractConfig, DraftMeta } from "./core/store/index.js";
export { ensureVoiceFiles } from "./core/voice/index.js";
export type { VoiceFile } from "./core/voice/index.js";
export {
  resolveVoiceFile,
  readVoiceFile,
  readAllVoices,
  appendVoiceSample,
  overwriteVoiceSample,
  clearVoiceFile,
  SAMPLE_SEPARATOR,
} from "./core/voice/index.js";
export type { Platform, Verdict } from "./shared/types.js";

// Global platform taste: distilled rules in ~/.tract/preferences/.
// Unlike review versions (per-commit episodes), these apply to every generation
// including first drafts. Same record format as voice/reference. V1: static +
// verdict-distilled appends. Cap keeps the file scannable; oldest rotates out.

import {
  SAMPLE_SEPARATOR,
  ensureSampleFiles,
  readSampleFile,
  appendSampleEntry,
  overwriteSampleEntry,
  clearSampleFile,
  splitEntries,
} from "../samplefile/index.js";

export const PREFERENCE_FILES = ["x.md", "linkedin.md", "blog.md"] as const;
export type PreferenceFile = (typeof PREFERENCE_FILES)[number];

/** Max rules per platform file. Oldest rotates out past the cap. */
export const MAX_PREFERENCE_RULES = 20;

/** CLI platform flag -> preference file. */
export function resolvePreferenceFile(flag: string | undefined): PreferenceFile | null {
  switch (flag) {
    case "--blog":
      return "blog.md";
    case "--x":
      return "x.md";
    case "--linkedin":
      return "linkedin.md";
    default:
      return null;
  }
}

/** Platform id -> its preference file (`blog` -> `blog.md`). */
export function platformPreferenceFile(platform: "blog" | "x" | "linkedin"): PreferenceFile {
  return `${platform}.md` as PreferenceFile;
}

/** Pre-creates the 3 preference files (empty) so `remove` can clear and `view` can read. */
export async function ensurePreferenceFiles(preferencesDir: string): Promise<void> {
  await ensureSampleFiles(preferencesDir, PREFERENCE_FILES);
}

export async function readPreferenceFile(preferencesDir: string, file: PreferenceFile): Promise<string> {
  return readSampleFile(preferencesDir, file);
}

export function splitPreferenceRules(content: string): string[] {
  return splitEntries(content);
}

/**
 * Appends a distilled rule. Exact dupes skipped; past the cap the oldest
 * rule rotates out ("appended-rotated") so taste stays current, not infinite.
 */
export async function appendPreferenceRule(
  preferencesDir: string,
  file: PreferenceFile,
  rule: string
): Promise<"appended" | "duplicate" | "appended-rotated"> {
  const trimmed = rule.trim();
  if (!trimmed) throw new Error("Nothing to add — rule is empty.");
  const current = await readSampleFile(preferencesDir, file);
  if (splitEntries(current).includes(trimmed)) return "duplicate";
  const res = await appendSampleEntry(preferencesDir, file, trimmed, "Nothing to add — rule is empty.");
  if (res === "duplicate") return "duplicate";
  const rules = splitEntries(await readSampleFile(preferencesDir, file));
  if (rules.length > MAX_PREFERENCE_RULES) {
    await overwriteSampleEntry(preferencesDir, file, rules.slice(-MAX_PREFERENCE_RULES).join(SAMPLE_SEPARATOR), "unreachable");
    return "appended-rotated";
  }
  return "appended";
}

/** Overwrites unconditionally — no confirm (same rule as voice). */
export async function overwritePreferenceFile(preferencesDir: string, file: PreferenceFile, content: string): Promise<void> {
  return overwriteSampleEntry(preferencesDir, file, content, "Nothing to write — content is empty.");
}

/** Clears the file (never deletes — pre-created skeleton stays). */
export async function clearPreferenceFile(preferencesDir: string, file: PreferenceFile): Promise<void> {
  return clearSampleFile(preferencesDir, file);
}

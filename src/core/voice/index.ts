// Voice profile files (global ~/.tract/voice/). V1: static files only; learning is V2.

import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const VOICE_FILES = ["voice.md", "x.md", "linkedin.md", "blog.md"] as const;
export type VoiceFile = (typeof VOICE_FILES)[number];

/** CLI platform flag -> voice file. */
export function resolveVoiceFile(flag: string | undefined): VoiceFile | null {
  switch (flag) {
    case "--blog":
      return "blog.md";
    case "--x":
      return "x.md";
    case "--linkedin":
      return "linkedin.md";
    case "--voice":
      return "voice.md";
    default:
      return null;
  }
}

/** Pre-creates the 4 voice files (empty) so `remove` can clear and `view` can read. */
export async function ensureVoiceFiles(voiceDir: string): Promise<void> {
  await mkdir(voiceDir, { recursive: true });
  for (const f of VOICE_FILES) {
    const p = join(voiceDir, f);
    try {
      await readFile(p, "utf8");
    } catch {
      await writeFile(p, "", "utf8");
    }
  }
}

export async function readVoiceFile(voiceDir: string, file: VoiceFile): Promise<string> {
  try {
    return await readFile(join(voiceDir, file), "utf8");
  } catch {
    return "";
  }
}

export async function readAllVoices(voiceDir: string): Promise<Record<VoiceFile, string>> {
  const entries = await Promise.all(VOICE_FILES.map(async (f) => [f, await readVoiceFile(voiceDir, f)] as const));
  return Object.fromEntries(entries) as Record<VoiceFile, string>;
}

/** Record separator between stored samples. A bare line, so multi-line samples survive. */
export const SAMPLE_SEPARATOR = "\n---\n";

function splitSamples(content: string): string[] {
  return content
    .split(SAMPLE_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Appends a sample. No min length — only empty strings rejected. Exact dupes skipped. */
export async function appendVoiceSample(voiceDir: string, file: VoiceFile, sample: string): Promise<"appended" | "duplicate"> {
  const trimmed = sample.trim();
  if (!trimmed) throw new Error("Nothing to add — sample is empty.");
  const current = await readVoiceFile(voiceDir, file);
  if (splitSamples(current).includes(trimmed)) return "duplicate";
  const next = current.trimEnd() ? `${current.trimEnd()}${SAMPLE_SEPARATOR}${trimmed}\n` : `${trimmed}\n`;
  await writeFile(join(voiceDir, file), next, "utf8");
  return "appended";
}

/** Overwrites unconditionally — no confirm (locked). */
export async function overwriteVoiceSample(voiceDir: string, file: VoiceFile, sample: string): Promise<void> {
  const trimmed = sample.trim();
  if (!trimmed) throw new Error("Nothing to write — sample is empty.");
  await writeFile(join(voiceDir, file), `${trimmed}\n`, "utf8");
}

/** Clears the file (never deletes — pre-created skeleton stays). */
export async function clearVoiceFile(voiceDir: string, file: VoiceFile): Promise<void> {
  await writeFile(join(voiceDir, file), "", "utf8");
}

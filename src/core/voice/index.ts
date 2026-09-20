// Voice profile files (global ~/.tract/voice/). V1: static files only; learning is V2.

import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const VOICE_FILES = ["voice.md", "x.md", "linkedin.md", "blog.md"] as const;
export type VoiceFile = (typeof VOICE_FILES)[number];

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

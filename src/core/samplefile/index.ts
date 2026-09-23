// Shared sample-file primitives (voice samples + reference examples).
// Both slices store newline-terminated files with "\n---\n"-separated entries,
// exact-dupe skip, empty reject. Wrappers in voice/reference preserve their
// public names + error wording; all fs logic lives here.

import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/** Record separator between stored entries. Distinct from a bare Markdown `---` line. */
export const SAMPLE_SEPARATOR = "\n--- tract-entry ---\n";

export function splitEntries(content: string): string[] {
  return content
    .split(SAMPLE_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function ensureSampleFiles(dir: string, files: readonly string[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const f of files) {
    const p = join(dir, f);
    try {
      await readFile(p, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      try {
        await writeFile(p, "", { encoding: "utf8", flag: "wx" });
      } catch (writeErr) {
        // Another process created it concurrently — content wins, keep it.
        if ((writeErr as NodeJS.ErrnoException)?.code !== "EEXIST") throw writeErr;
      }
    }
  }
}

export async function readSampleFile(dir: string, file: string): Promise<string> {
  try {
    return await readFile(join(dir, file), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return "";
    throw err;
  }
}

export async function appendSampleEntry(
  dir: string,
  file: string,
  entry: string,
  emptyMessage: string
): Promise<"appended" | "duplicate"> {
  const trimmed = entry.trim();
  if (!trimmed) throw new Error(emptyMessage);
  const current = await readSampleFile(dir, file);
  if (splitEntries(current).includes(trimmed)) return "duplicate";
  const next = current.trimEnd() ? `${current.trimEnd()}${SAMPLE_SEPARATOR}${trimmed}\n` : `${trimmed}\n`;
  await writeFile(join(dir, file), next, "utf8");
  return "appended";
}

export async function overwriteSampleEntry(dir: string, file: string, entry: string, emptyMessage: string): Promise<void> {
  const trimmed = entry.trim();
  if (!trimmed) throw new Error(emptyMessage);
  await writeFile(join(dir, file), `${trimmed}\n`, "utf8");
}

/** Clears the file (never deletes — pre-created skeleton stays). */
export async function clearSampleFile(dir: string, file: string): Promise<void> {
  await writeFile(join(dir, file), "", "utf8");
}

// Shared CLI helpers: single-select flags + draft-dir resolution.
// One implementation for all commands — no per-file copies. CLI-only.

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { getRepoSlug, getTractHome, resolveSha } from "../index.js";

/** Names of the flags set to true, restricted to an allow-list. */
export function selectedFlags(opts: Record<string, unknown>, allowed: readonly string[]): string[] {
  return allowed.filter((name) => opts[name] === true);
}

/** sha dir for a commit (default HEAD): ~/.tract/repos/<slug>/<sha>/ */
export async function resolveDraftDir(cwd: string, shaOrHead?: string): Promise<{ dir: string; sha: string }> {
  const sha = await resolveSha(cwd, shaOrHead ?? "HEAD");
  const slug = await getRepoSlug(cwd);
  return { dir: join(getTractHome(), "repos", slug, sha), sha };
}

/** Draft text, or null when it was never generated. */
export async function readDraft(dir: string, file: string): Promise<string | null> {
  try {
    return await readFile(join(dir, file), "utf8");
  } catch {
    return null;
  }
}

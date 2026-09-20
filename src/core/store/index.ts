// Engine: global ~/.tract store. No repo-local .tract (locked Q7).

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Verdict } from "../../shared/types.js";
import { VOICE_FILES, ensureVoiceFiles } from "../voice/index.js";

export { VOICE_FILES };

export interface TractConfig {
  jevModel: string;
  threshold: number;
}

export const DEFAULT_CONFIG: TractConfig = { jevModel: "jev-latest", threshold: 0.5 };

export function getTractHome(): string {
  return join(homedir(), ".tract");
}

function writeDefaultConfig(path: string): Promise<void> {
  return writeFile(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
}

function sha1Hex(s: string, len: number): string {
  return createHash("sha1").update(s).digest("hex").slice(0, len);
}

function gitRemote(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["remote", "get-url", "origin"], { cwd }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim() || null);
    });
  });
}

function gitTopLevel(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--show-toplevel"], { cwd }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim() || null);
    });
  });
}

/** Namespace drafts per repo inside the global store. */
export async function getRepoSlug(cwd: string): Promise<string> {
  const remote = await gitRemote(cwd);
  const top = await gitTopLevel(cwd);
  const base = top ?? cwd;
  const key = remote ?? base;
  const name = (basename(base) || "repo").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 40);
  return `${name}-${sha1Hex(key, 8)}`;
}

/** Full first-run skeleton: voice files + config + repos dir. */
export async function ensureTractHome(): Promise<string> {
  const home = getTractHome();
  await ensureVoiceFiles(join(home, "voice"));
  await mkdir(join(home, "repos"), { recursive: true });
  const configPath = join(home, "config.json");
  try {
    await readFile(configPath, "utf8");
  } catch {
    await writeDefaultConfig(configPath);
  }
  return home;
}

export async function loadConfig(): Promise<TractConfig> {
  const home = await ensureTractHome();
  const path = join(home, "config.json");
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<TractConfig>;
    return {
      jevModel: typeof parsed.jevModel === "string" ? parsed.jevModel : DEFAULT_CONFIG.jevModel,
      threshold: typeof parsed.threshold === "number" ? parsed.threshold : DEFAULT_CONFIG.threshold,
    };
  } catch {
    await writeDefaultConfig(path);
    return { ...DEFAULT_CONFIG };
  }
}

export interface DraftMeta {
  sha: string;
  diffHash: string;
  noul: number | null;
  threshold: number;
  verdict: Verdict;
  forced: boolean;
  forcedReason?: string;
  model: string;
  at: string;
}

export function hashDiff(diff: string): string {
  return sha1Hex(diff, 12);
}

export async function saveMeta(slug: string, sha: string, meta: DraftMeta, diff: string): Promise<string> {
  const dir = join(getTractHome(), "repos", slug, sha);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await Promise.all([
    writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", { encoding: "utf8", mode: 0o600 }),
    writeFile(join(dir, "diff.patch"), diff, { encoding: "utf8", mode: 0o600 }),
  ]);
  return dir;
}

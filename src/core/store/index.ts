// Engine: global ~/.tract store. No repo-local .tract (locked Q7).

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { Verdict } from "../../shared/types.js";
import { ensureVoiceFiles } from "../voice/index.js";
import { ensureReferenceFiles } from "../reference/index.js";
import { ensurePreferenceFiles } from "../preferences/index.js";

export interface TractConfig {
  jevModel: string;
  threshold: number;
  genModel: string;
}

export const DEFAULT_CONFIG: TractConfig = {
  jevModel: "jev-latest",
  threshold: 0.5,
  genModel: "openai/gpt-oss-20b",
};

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

/** Full first-run skeleton: voice + reference + preference files, config, repos dir. */
export async function ensureTractHome(): Promise<string> {
  const home = getTractHome();
  await ensureVoiceFiles(join(home, "voice"));
  await ensureReferenceFiles(join(home, "reference"));
  await ensurePreferenceFiles(join(home, "preferences"));
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
  let parsed: Partial<TractConfig> = {};
  let corruptOrMissing = false;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as Partial<TractConfig>;
  } catch {
    // Missing or corrupt — fall through to defaults and rewrite.
    corruptOrMissing = true;
  }
  const merged: TractConfig = {
    jevModel: typeof parsed.jevModel === "string" ? parsed.jevModel : DEFAULT_CONFIG.jevModel,
    threshold: typeof parsed.threshold === "number" ? parsed.threshold : DEFAULT_CONFIG.threshold,
    genModel: typeof parsed.genModel === "string" ? parsed.genModel : DEFAULT_CONFIG.genModel,
  };
  // Write only when backfilling missing values or recovering from corruption;
  // unchanged valid configs are left alone.
  const needsWrite =
    corruptOrMissing || parsed.jevModel !== merged.jevModel || parsed.threshold !== merged.threshold || parsed.genModel !== merged.genModel;
  if (needsWrite) {
    // Atomic replace so concurrent loads never observe a partial write.
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, JSON.stringify(merged, null, 2) + "\n", "utf8");
    await rename(tmp, path);
  }
  return merged;
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

export async function saveMeta(slug: string, sha: string, meta: DraftMeta): Promise<string> {
  const dir = join(getTractHome(), "repos", slug, sha);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return dir;
}

// Engine: git access. UI-agnostic, no CLI imports. Secrets never read here.

import { execFile } from "node:child_process";
import { shapeDiffForJudge } from "./ignore.js";

export { IGNORED_DIR_PREFIXES, IGNORED_FILES, IGNORED_SUFFIXES, shapeDiffForJudge } from "./ignore.js";

const MAX_DIFF_CHARS = 30_000;

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`git ${args.join(" ")} failed: ${stderr.trim() || err.message}`));
      else resolve(stdout);
    });
  });
}

export function truncateDiff(diff: string): { diff: string; truncated: boolean } {
  if (diff.length <= MAX_DIFF_CHARS) return { diff, truncated: false };
  return { diff: diff.slice(0, MAX_DIFF_CHARS) + "\n... [truncated]", truncated: true };
}

function parseFileList(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Empty tree object: diffing against it shows all tracked files (pre-first-commit). */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

async function hasHead(cwd: string): Promise<boolean> {
  try {
    await runGit(cwd, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function shapeAndTruncate(rawDiff: string): { diff: string; truncated: boolean } {
  return truncateDiff(shapeDiffForJudge(rawDiff).diff);
}

/** Pre-commit preview: what Jev would see if run right now. Tracked changes only. */
export async function getDiffPreview(
  cwd: string,
  opts: { stagedOnly: boolean } = { stagedOnly: false }
): Promise<{ diff: string; filesChanged: string[]; truncated: boolean }> {
  let diffArgs: string[];
  let filesArgs: string[];
  if (opts.stagedOnly) {
    diffArgs = ["diff", "--cached", "--no-color"];
    filesArgs = ["diff", "--cached", "--name-only"];
  } else if (await hasHead(cwd)) {
    diffArgs = ["diff", "HEAD", "--no-color"];
    filesArgs = ["diff", "--name-only", "HEAD"];
  } else {
    diffArgs = ["diff", EMPTY_TREE, "--no-color"];
    filesArgs = ["diff", "--name-only", EMPTY_TREE];
  }
  const [raw, filesRaw] = await Promise.all([runGit(cwd, diffArgs), runGit(cwd, filesArgs)]);
  const { diff, truncated } = shapeAndTruncate(raw);
  const filesChanged = parseFileList(filesRaw);
  return { diff, filesChanged, truncated };
}

export async function resolveSha(cwd: string, shaOrHead: string = "HEAD"): Promise<string> {
  return (await runGit(cwd, ["rev-parse", shaOrHead])).trim();
}

/** Committed commit payload for `generate [<sha>]` (default HEAD). */
export async function getCommitPayload(
  cwd: string,
  shaOrHead: string = "HEAD"
): Promise<{ sha: string; commitMessage: string; diff: string; filesChanged: string[]; truncated: boolean }> {
  const sha = await resolveSha(cwd, shaOrHead);
  const [commitMessage, rawDiff, filesRaw] = await Promise.all([
    runGit(cwd, ["log", "-1", "--format=%B", sha]),
    runGit(cwd, ["show", sha, "--format=", "--no-color", "--patch"]),
    runGit(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", sha]),
  ]);
  const { diff, truncated } = shapeAndTruncate(rawDiff);
  const filesChanged = parseFileList(filesRaw);
  return { sha, commitMessage: commitMessage.trim(), diff, filesChanged, truncated };
}

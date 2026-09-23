// Engine: git access. UI-agnostic, no CLI imports. Secrets never read here.

import { execFile } from "node:child_process";
import { shapeDiffForJudge } from "./ignore.js";

export { IGNORED_DIR_PREFIXES, IGNORED_FILES, IGNORED_SUFFIXES, isIgnoredPath, shapeDiffForJudge } from "./ignore.js";

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
  return [...new Set(raw.split("\n").map((s) => s.trim()).filter(Boolean))];
}

function shapeAndTruncate(rawDiff: string): { diff: string; truncated: boolean } {
  return truncateDiff(shapeDiffForJudge(rawDiff).diff);
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
    runGit(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-m", "--root", sha]),
  ]);
  const { diff, truncated } = shapeAndTruncate(rawDiff);
  const filesChanged = parseFileList(filesRaw);
  return { sha, commitMessage: commitMessage.trim(), diff, filesChanged, truncated };
}

/** One-letter change kind per path in a commit (R = renamed, path is the new name). */
export interface FileStatus {
  path: string;
  status: string;
  /** Rename/copy source (only set for R/C statuses). */
  previousPath?: string;
}

export async function getFileStatuses(cwd: string, sha: string): Promise<FileStatus[]> {
  // -m: merges diff against each parent (default prints nothing for merges).
  // -z: NUL-delimited, so quoted/unusual paths arrive verbatim.
  const raw = await runGit(cwd, ["diff-tree", "--no-commit-id", "--name-status", "-r", "-m", "--root", "-z", sha]);
  const tokens = raw.split("\0");
  const out: FileStatus[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < tokens.length) {
    const statusTok = tokens[i];
    if (!statusTok) break;
    const letter = statusTok.slice(0, 1);
    if (letter === "R" || letter === "C") {
      const src = tokens[i + 1];
      const dest = tokens[i + 2];
      if (dest === undefined || dest === "") break;
      if (!seen.has(dest)) {
        seen.add(dest);
        out.push({ status: letter, path: dest, previousPath: src || undefined });
      }
      i += 3;
    } else {
      const path = tokens[i + 1];
      if (path === undefined || path === "") break;
      if (!seen.has(path)) {
        seen.add(path);
        out.push({ status: letter, path });
      }
      i += 2;
    }
  }
  return out;
}

/** Parent commit message (nulls on root commits). */
export async function getParentMessage(cwd: string, sha: string): Promise<{ sha: string | null; message: string | null }> {
  try {
    const parent = (await runGit(cwd, ["rev-parse", `${sha}^`])).trim();
    const message = (await runGit(cwd, ["log", "-1", "--format=%B", parent])).trim();
    return { sha: parent, message };
  } catch {
    return { sha: null, message: null };
  }
}

/** Blob size cap: larger files are reported as "too-large" without reading them. */
export const MAX_BLOB_BYTES = 1_000_000;

/**
 * File content at a commit. Null only when the path doesn't exist there
 * (deleted). "too-large" when the blob exceeds MAX_BLOB_BYTES.
 */
export async function readFileAtCommit(cwd: string, sha: string, path: string): Promise<string | null | "too-large"> {
  try {
    const sizeRaw = await runGit(cwd, ["cat-file", "-s", `${sha}:${path}`]);
    const size = Number.parseInt(sizeRaw.trim(), 10);
    if (Number.isFinite(size) && size > MAX_BLOB_BYTES) return "too-large";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not exist|not a valid object|bad file/i.test(msg)) return null;
    throw err;
  }
  try {
    return await runGit(cwd, ["show", `${sha}:${path}`]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not exist/i.test(msg)) return null;
    throw err;
  }
}

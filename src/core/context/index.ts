// Engine: commit context gathering + cleaning. No LLM here — output is the
// ready-to-serve input for the generation slice (and for Jev debugging).
// Saved per slug/sha under ~/.tract and reused: same sha => same context.

import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getCommitPayload, getFileStatuses, getParentMessage, readFileAtCommit, resolveSha } from "../git/index.js";
import { isIgnoredPath } from "../git/ignore.js";
import { getRepoSlug, getTractHome } from "../store/index.js";

/** Per-file content cap; larger files truncate with a marker. */
export const MAX_FILE_CHARS = 12_000;
/** Total content budget across files; rest are omitted with a reason. */
export const MAX_TOTAL_CHARS = 60_000;

export type OmitReason = "ignored" | "deleted" | "binary" | "budget";

export interface ContextFile {
  path: string;
  status: string;
  /** Rename/copy source (only set for R/C statuses). */
  previousPath?: string;
  included: boolean;
  omittedReason?: OmitReason;
  truncated?: boolean;
  chars: number;
  /** Cleaned content at the commit. Null unless included. */
  content: string | null;
}

export interface CommitContext {
  sha: string;
  commitMessage: string;
  previousSha: string | null;
  previousCommitMessage: string | null;
  /** Every touched path, including ignored ones (names are signal). */
  filesChanged: string[];
  /** Shaped + truncated unified diff (ignored contents collapsed). */
  shapedDiff: string;
  diffTruncated: boolean;
  files: ContextFile[];
  totalContentChars: number;
}

/** Normalize endings, strip trailing whitespace, cap runaway blank lines. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function isBinary(content: string): boolean {
  return content.includes("\0");
}

/** Full generation-ready context for one commit (default HEAD). */
export async function gatherCommitContext(cwd: string, shaOrHead: string = "HEAD"): Promise<CommitContext> {
  const payload = await getCommitPayload(cwd, shaOrHead);
  const [statuses, parent] = await Promise.all([
    getFileStatuses(cwd, payload.sha),
    getParentMessage(cwd, payload.sha),
  ]);

  // Phase 1: fetch file contents in bounded-parallel batches (8 git procs max).
  // Budget accounting stays sequential below so output is deterministic.
  const BATCH_SIZE = 8;
  const raws: Array<string | null | "ignored" | "too-large"> = new Array(statuses.length);
  const toFetch: number[] = [];
  statuses.forEach(({ path, status }, i) => {
    if (isIgnoredPath(path)) raws[i] = "ignored";
    else if (status === "D") raws[i] = null;
    else toFetch.push(i);
  });
  for (let b = 0; b < toFetch.length; b += BATCH_SIZE) {
    const batch = toFetch.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map((i) => readFileAtCommit(cwd, payload.sha, statuses[i].path)));
    batch.forEach((idx, k) => {
      raws[idx] = results[k] ?? null;
    });
  }

  // Phase 2: clean + apply per-file / total budgets in original order.
  const files: ContextFile[] = [];
  let total = 0;

  for (let i = 0; i < statuses.length; i++) {
    const { path, status, previousPath } = statuses[i];
    const raw = raws[i];
    if (raw === "ignored") {
      files.push({ path, status, previousPath, included: false, omittedReason: "ignored", chars: 0, content: null });
      continue;
    }
    if (raw === "too-large") {
      files.push({ path, status, previousPath, included: false, omittedReason: "budget", chars: 0, content: null });
      continue;
    }
    if (raw === null) {
      files.push({ path, status, previousPath, included: false, omittedReason: "deleted", chars: 0, content: null });
      continue;
    }
    if (isBinary(raw)) {
      files.push({ path, status, previousPath, included: false, omittedReason: "binary", chars: 0, content: null });
      continue;
    }
    let content = cleanText(raw);
    let truncated = false;
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + "\n... [file truncated]";
      truncated = true;
    }
    if (total + content.length > MAX_TOTAL_CHARS) {
      files.push({ path, status, previousPath, included: false, omittedReason: "budget", chars: 0, content: null });
      continue;
    }
    total += content.length;
    files.push({ path, status, previousPath, included: true, truncated: truncated || undefined, chars: content.length, content });
  }

  return {
    sha: payload.sha,
    commitMessage: cleanText(payload.commitMessage),
    previousSha: parent.sha,
    previousCommitMessage: parent.message === null ? null : cleanText(parent.message),
    filesChanged: payload.filesChanged,
    shapedDiff: payload.diff,
    diffTruncated: payload.truncated,
    files,
    totalContentChars: total,
  };
}

/** Schema tag on cached context: bump when gather output can change shape. */
export const CONTEXT_SCHEMA = 1;

interface CachedContext {
  schema: number;
  savedAt: string;
  context: CommitContext;
}

function contextPath(home: string, slug: string, sha: string): string {
  return join(home, "repos", slug, sha, "context.json");
}

export async function saveCommitContext(home: string, slug: string, context: CommitContext): Promise<string> {
  const path = contextPath(home, slug, context.sha);
  await mkdir(join(home, "repos", slug, context.sha), { recursive: true });
  const cached: CachedContext = { schema: CONTEXT_SCHEMA, savedAt: new Date().toISOString(), context };
  await writeFile(path, JSON.stringify(cached, null, 2) + "\n", "utf8");
  return path;
}

export async function loadCommitContext(home: string, slug: string, sha: string): Promise<CommitContext | null> {
  try {
    const raw = await readFile(contextPath(home, slug, sha), "utf8");
    const cached = JSON.parse(raw) as CachedContext;
    if (cached.schema !== CONTEXT_SCHEMA) return null;
    if (!cached.context || cached.context.sha !== sha) return null;
    return cached.context;
  } catch {
    return null;
  }
}

/**
 * Read-through cache shared by `generate` and `context`: same sha always
 * resolves to the same stored context; gathers + saves on first use.
 */
export async function loadOrGatherCommitContext(
  cwd: string,
  shaOrHead: string = "HEAD"
): Promise<{ context: CommitContext; source: "cached" | "gathered" }> {
  const home = getTractHome();
  const [sha, slug] = await Promise.all([resolveSha(cwd, shaOrHead), getRepoSlug(cwd)]);
  const cached = await loadCommitContext(home, slug, sha);
  if (cached) return { context: cached, source: "cached" };
  const context = await gatherCommitContext(cwd, sha);
  await saveCommitContext(home, slug, context);
  return { context, source: "gathered" };
}

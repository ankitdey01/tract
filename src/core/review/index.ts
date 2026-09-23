// Engine: review state — versions, verdicts, preference summaries.
// Draft-first integrity: verdicts bind to content hashes, never to file names.
// A verdict on changed text snapshots a new version first; nothing is ever
// approved blind.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { Platform } from "../../shared/types.js";
import type { Generator } from "../generation/index.js";

export type ReviewStatus = "pending" | "accepted" | "rejected";

export interface ReviewVersion {
  hash: string;
  content: string;
  /** What makes THIS text good: learned from the edit that produced it. Null until compared. */
  preference: string | null;
}

export interface ReviewState {
  versions: ReviewVersion[];
  status: ReviewStatus;
  reason: string | null;
  decidedAt: string | null;
}

export const DEFAULT_REJECT_REASON = "User didn't like this draft for some unspecified reason.";

export function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex").slice(0, 12);
}

export function reviewFileName(platform: Platform): `review-${Platform}.json` {
  return `review-${platform}.json`;
}

function reviewPath(dir: string, platform: Platform): string {
  return join(dir, reviewFileName(platform));
}

export async function readReviewState(dir: string, platform: Platform): Promise<ReviewState | null> {
  try {
    const raw = await readFile(reviewPath(dir, platform), "utf8");
    const parsed = JSON.parse(raw) as ReviewState;
    if (!Array.isArray(parsed.versions) || parsed.versions.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeReviewState(dir: string, platform: Platform, state: ReviewState): Promise<void> {
  await writeFile(reviewPath(dir, platform), JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** Fresh lineage: first snapshot + pending verdict. Also the regenerate reset. */
export async function initReview(dir: string, platform: Platform, draftBody: string): Promise<ReviewState> {
  const state: ReviewState = {
    versions: [{ hash: hashContent(draftBody), content: draftBody, preference: null }],
    status: "pending",
    reason: null,
    decidedAt: null,
  };
  await writeReviewState(dir, platform, state);
  return state;
}

export interface VerdictInput {
  dir: string;
  platform: Platform;
  /** Current on-disk draft text. */
  fileContent: string;
  accept: boolean;
  reason?: string;
  summarizer: Generator;
}

/** Records a verdict, snapshotting + summarizing first when the text moved. */
export async function recordVerdict(
  input: VerdictInput
): Promise<{ state: ReviewState; preferenceAdded: boolean; globalRule: string }> {
  const state = await readReviewState(input.dir, input.platform);
  if (!state) throw new Error("No review state — generate a draft first.");
  const latest = state.versions[state.versions.length - 1];
  const currentHash = hashContent(input.fileContent);

  let preferenceAdded = false;
  let globalRule = "";
  if (currentHash !== latest.hash) {
    const pair = await input.summarizer.summarizePreference(latest.content, input.fileContent);
    const commitPreference = pair.commitPreference || null;
    globalRule = pair.globalRule;
    state.versions.push({ hash: currentHash, content: input.fileContent, preference: commitPreference });
    preferenceAdded = true;
  }

  const reason = input.reason?.trim() || null;
  state.status = input.accept ? "accepted" : "rejected";
  state.reason = reason ?? (input.accept ? null : DEFAULT_REJECT_REASON);
  state.decidedAt = new Date().toISOString();
  await writeReviewState(input.dir, input.platform, state);
  return { state, preferenceAdded, globalRule };
}

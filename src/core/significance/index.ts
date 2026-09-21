// Engine: Jev-only significance gate. Secrets (apiKey) passed in, never read here.

import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { Verdict } from "../../shared/types.js";
import { IS_SIGNIFICANT_CRITERIA, IS_SIGNIFICANT_INSTRUCTIONS } from "./prompts.js";

export { IS_SIGNIFICANT_CRITERIA, IS_SIGNIFICANT_INSTRUCTIONS } from "./prompts.js";

export interface SignificanceInput {
  diff: string;
  commitMessage: string;
  filesChanged: string[];
}

export interface SignificanceResult {
  noul: number | null;
  threshold: number;
  verdict: Verdict;
  forced: boolean;
  forcedReason?: string;
}

export interface SignificanceJudge {
  judge(input: SignificanceInput): Promise<number>;
}

/** Live Jev judge. apiKey + model are inputs (CLI passes env/config in). */
export class JevSignificanceJudge implements SignificanceJudge {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "jev-latest"
  ) {}

  async judge(input: SignificanceInput): Promise<number> {
    const client = new TypeSafeClient({ apiKey: this.apiKey });
    const response = await client.systemOne({
      state: {
        diff: input.diff,
        commitMessage: input.commitMessage,
        filesChanged: input.filesChanged,
      },
      questions: {
        is_significant: {
          type: "noul",
          instructions: IS_SIGNIFICANT_INSTRUCTIONS,
          criteria: {
            true: IS_SIGNIFICANT_CRITERIA.true,
            false: IS_SIGNIFICANT_CRITERIA.false,
          },
        },
      },
      model: this.model,
    });
    const noul = response.answers?.is_significant?.noul;
    if (typeof noul !== "number" || Number.isNaN(noul)) throw new Error("Jev returned no noul value");
    return noul;
  }
}

/**
 * The sole gate. `--force` bypasses. Per locked policy (Q11): persistent Jev
 * errors force through with a warning — a hung API never blocks usage.
 */
const JUDGE_TIMEOUT_MS = 30_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Jev request timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function judgeSignificance(
  input: SignificanceInput,
  opts: { threshold: number; force: boolean; judge?: SignificanceJudge }
): Promise<SignificanceResult> {
  if (opts.force) {
    return { noul: null, threshold: opts.threshold, verdict: "pass", forced: true, forcedReason: "--force bypass" };
  }
  if (!opts.judge) throw new Error("No significance judge provided (set TYPESAFE_API_KEY or use --force)");
  try {
    const noul = await withTimeout(opts.judge.judge(input), JUDGE_TIMEOUT_MS);
    return { noul, threshold: opts.threshold, verdict: noul >= opts.threshold ? "pass" : "fail", forced: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { noul: null, threshold: opts.threshold, verdict: "pass", forced: true, forcedReason: `Jev error, forced through: ${reason}` };
  }
}

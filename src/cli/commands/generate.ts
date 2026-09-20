// `tract generate` — Jev gate over a commit (default HEAD).

import {
  getCommitPayload,
  JevSignificanceJudge,
  judgeSignificance,
  getRepoSlug,
  hashDiff,
  loadConfig,
  saveMeta,
} from "../../index.js";
import type { CommandContext, TractCommand } from "../router.js";

async function run(ctx: CommandContext): Promise<void> {
  const shaOrHead = ctx.positional[0];
  const force = ctx.flags.force;
  const payload = await getCommitPayload(ctx.cwd, shaOrHead ?? "HEAD");
  if (!payload.diff.trim()) {
    console.log(`Commit ${payload.sha} has no diff — nothing to judge.`);
    return;
  }
  const config = await loadConfig();
  const apiKey = process.env["TYPESAFE_API_KEY"] ?? "";
  if (!force && !apiKey) {
    console.error("Missing TYPESAFE_API_KEY. Set it or re-run with --force.");
    process.exitCode = 1;
    return;
  }
  const result = await judgeSignificance(
    { diff: payload.diff, commitMessage: payload.commitMessage, filesChanged: payload.filesChanged },
    { threshold: config.threshold, force, judge: apiKey ? new JevSignificanceJudge(apiKey, config.jevModel) : undefined }
  );
  const slug = await getRepoSlug(ctx.cwd);
  const dir = await saveMeta(
    slug,
    payload.sha,
    {
      sha: payload.sha,
      diffHash: hashDiff(payload.diff),
      noul: result.noul,
      threshold: result.threshold,
      verdict: result.verdict,
      forced: result.forced,
      forcedReason: result.forcedReason,
      model: config.jevModel,
      at: new Date().toISOString(),
    },
    payload.diff
  );
  if (result.forced && result.forcedReason && !force) console.warn(`warning: ${result.forcedReason}`);
  if (force) console.log("(--force: Jev gate bypassed)");
  console.log(
    result.verdict === "pass"
      ? `significant${result.noul === null ? "" : ` (noul=${result.noul.toFixed(3)} >= ${result.threshold})`} — ${payload.sha.slice(0, 8)}`
      : `not significant${result.noul === null ? "" : ` (noul=${result.noul.toFixed(3)} < ${result.threshold})`} — ${payload.sha.slice(0, 8)}`
  );
  console.log(`meta: ${dir}`);
  if (result.verdict === "fail") {
    process.exitCode = 2;
    return;
  }
  console.log("generation slice next: drafts not yet implemented in this slice.");
}

export const command: TractCommand = {
  name: "generate",
  description: "Jev gate over a commit (default HEAD)",
  usage: "generate [<sha>] [--force]",
  run,
};

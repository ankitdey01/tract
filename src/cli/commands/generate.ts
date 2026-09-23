// `tract generate` — Jev gate, then one platform draft on request.

import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import {
  JevSignificanceJudge,
  judgeSignificance,
  getRepoSlug,
  hashDiff,
  loadConfig,
  saveMeta,
  gatherCommitContext,
  loadOrGatherCommitContext,
  readVoiceFile,
  getTractHome,
  GroqGenerator,
  platformDraftFile,
  readReferenceFile,
  platformReferenceFile,
  readPreferenceFile,
  splitPreferenceRules,
  platformPreferenceFile,
  readReviewState,
  initReview,
} from "../../index.js";
import type { CommandContext, TractCommand } from "../router.js";
import type { Platform } from "../../index.js";
import { selectedFlags } from "../helpers.js";

function requestedPlatform(ctx: CommandContext): Platform | null {
  const want = selectedFlags(ctx.opts, ["blog", "x", "linkedin"]);
  if (want.length === 0) return null;
  if (want.length > 1) {
    console.error(`One platform per request — pass one of --blog, --x, --linkedin (got ${want.map((p) => `--${p}`).join(", ")}).`);
    process.exitCode = 1;
    return null;
  }
  return (want[0] ?? null) as Platform | null;
}

async function run(ctx: CommandContext): Promise<void> {
  // Reject conflicting platform flags before any context work, Jev call, or meta save.
  const earlyPlatform = requestedPlatform(ctx);
  if (earlyPlatform === null && process.exitCode === 1) return;
  const shaOrHead = ctx.positional[0];
  const force = ctx.opts["force"] === true;
  // Single path: the stored context feeds both Jev and the generator.
  // Same sha => same context, gathered once and reused from ~/.tract.
  const { context, source } = await loadOrGatherCommitContext(ctx.cwd, shaOrHead ?? "HEAD");
  console.log(`context: ${source} — ${context.sha.slice(0, 8)}`);
  if (!context.shapedDiff.trim()) {
    console.log(`Commit ${context.sha} has no diff — nothing to judge.`);
    return;
  }
  const config = await loadConfig();
  const jevKey = process.env["TYPESAFE_API_KEY"] ?? "";
  if (!force && !jevKey) {
    console.error("Missing TYPESAFE_API_KEY. Set it or re-run with --force.");
    process.exitCode = 1;
    return;
  }
  const result = await judgeSignificance(
    { diff: context.shapedDiff, commitMessage: context.commitMessage, filesChanged: context.filesChanged },
    { threshold: config.threshold, force, judge: jevKey ? new JevSignificanceJudge(jevKey, config.jevModel) : undefined }
  );
  const slug = await getRepoSlug(ctx.cwd);
  const dir = await saveMeta(
    slug,
    context.sha,
    {
      sha: context.sha,
      diffHash: hashDiff(context.shapedDiff),
      noul: result.noul,
      threshold: result.threshold,
      verdict: result.verdict,
      forced: result.forced,
      forcedReason: result.forcedReason,
      model: config.jevModel,
      at: new Date().toISOString(),
    }
  );
  if (result.forced && result.forcedReason && !force) console.warn(`warning: ${result.forcedReason}`);
  if (force) console.log("(--force: Jev gate bypassed)");
  console.log(
    result.verdict === "pass"
      ? `significant${result.noul === null ? "" : ` (noul=${result.noul.toFixed(3)} >= ${result.threshold})`} — ${context.sha.slice(0, 8)}`
      : `not significant${result.noul === null ? "" : ` (noul=${result.noul.toFixed(3)} < ${result.threshold})`} — ${context.sha.slice(0, 8)}`
  );
  console.log(`meta: ${dir}`);
  if (result.verdict === "fail") {
    process.exitCode = 2;
    return;
  }

  const platform = earlyPlatform;
  if (platform === null) {
    console.log("No platform requested — add --blog, --x, or --linkedin to draft.");
    return;
  }

  const groqKey = process.env["GROQ_KEY"] ?? "";
  if (!groqKey) {
    console.error("Missing GROQ_KEY. Add it to .env to draft.");
    process.exitCode = 1;
    return;
  }
  const home = getTractHome();
  if (!config.genModel.includes("gpt-oss"))
    console.warn(`warning: genModel "${config.genModel}" is not gpt-oss — browser search is silently inactive.`);
  const [voiceDefault, voicePlatform, prevReview, globalRulesRaw] = await Promise.all([
    readVoiceFile(join(home, "voice"), "voice.md"),
    readVoiceFile(join(home, "voice"), platformDraftFile(platform)),
    readReviewState(dir, platform),
    readPreferenceFile(join(home, "preferences"), platformPreferenceFile(platform)),
  ]);
  const preferences = (prevReview?.versions ?? []).map((v) => v.preference).filter((p): p is string => !!p);
  if (preferences.length > 0) console.log(`applying ${preferences.length} learned preference(s) from prior review.`);
  const globalPreferences = splitPreferenceRules(globalRulesRaw);
  if (globalPreferences.length > 0) console.log(`applying ${globalPreferences.length} platform taste rule(s).`);
  const draft = await new GroqGenerator(groqKey, config.genModel).generate({
    platform,
    context,
    voiceDefault,
    voicePlatform,
    reference: await readReferenceFile(join(home, "reference"), platformReferenceFile(platform)),
    preferences,
    globalPreferences,
  });
  const draftPath = join(dir, platformDraftFile(platform));
  const genPayload = {
    platform,
    model: draft.model,
    ms: draft.ms,
    inputTokens: draft.inputTokens,
    outputTokens: draft.outputTokens,
    finishReason: draft.finishReason,
    rawFinishReason: draft.rawFinishReason,
    steps: draft.steps,
    warnings: draft.warnings,
    at: new Date().toISOString(),
  };
  // Empty body is never a draft: persist the failure receipt (gen json) so
  // limit/filter/error stops can be diagnosed later, and stop before touching
  // the draft file or review lineage.
  if (!draft.body.trim()) {
    await writeFile(join(dir, `gen-${platform}.json`), JSON.stringify({ ...genPayload, error: "empty draft — no text in final step" }, null, 2) + "\n", "utf8");
    console.error(
      `No draft written — model returned no text (finishReason=${draft.finishReason}, raw=${draft.rawFinishReason ?? "null"}, steps=${draft.steps}, tokens=${draft.inputTokens ?? "?"}/${draft.outputTokens ?? "?"}). See gen-${platform}.json.`
    );
    process.exitCode = 1;
    return;
  }
  const draftText = draft.body.endsWith("\n") ? draft.body : draft.body + "\n";
  await Promise.all([
    writeFile(draftPath, draftText, "utf8"),
    writeFile(join(dir, `gen-${platform}.json`), JSON.stringify(genPayload, null, 2) + "\n", "utf8"),
  ]);
  console.log(`draft (${draft.model}, ${(draft.ms / 1000).toFixed(1)}s): ${draftPath}`);
  // Fresh lineage: v1 snapshot + pending verdict. A previous verdict is dead —
  // say so loudly instead of letting stale approval linger.
  await initReview(dir, platform, draftText);
  if (prevReview && prevReview.status !== "pending") {
    console.log(`previous review (${prevReview.status}) superseded — new draft needs review.`);
  }
}

export const command: TractCommand = {
  name: "generate",
  description: "Jev gate, then draft one platform (default HEAD)",
  args: [{ name: "sha", description: "commit to use (default HEAD)" }],
  options: [
    { flags: "--force", description: "skip the Jev gate" },
    { flags: "--blog", description: "draft the blog post" },
    { flags: "--x", description: "draft the X post" },
    { flags: "--linkedin", description: "draft the LinkedIn post" },
  ],
  run,
};

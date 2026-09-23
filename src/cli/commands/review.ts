// `tract review` — display a stored draft and record accept/reject.
// Verdicts bind to content hashes: changed text snapshots a new version first.

import {
  getTractHome,
  loadConfig,
  GroqGenerator,
  platformDraftFile,
  platformPreferenceFile,
  readReviewState,
  initReview,
  recordVerdict,
  appendPreferenceRule,
  MAX_PREFERENCE_RULES,
} from "../../index.js";
import { join } from "node:path";
import { resolveDraftDir, readDraft, selectedFlags } from "../helpers.js";
import type { CommandContext, TractCommand } from "../router.js";
import type { Platform } from "../../index.js";

const PLATFORMS = ["blog", "x", "linkedin"] as const;

function requestedPlatform(ctx: CommandContext): Platform | null {
  const want = selectedFlags(ctx.opts, PLATFORMS);
  if (want.length === 0) return null;
  if (want.length > 1) {
    console.error(`One platform at a time — pass one of --blog, --x, --linkedin (got ${want.map((p) => `--${p}`).join(", ")}).`);
    process.exitCode = 1;
    return null;
  }
  return (want[0] ?? null) as Platform | null;
}

async function run(ctx: CommandContext): Promise<void> {
  const platform = requestedPlatform(ctx);
  if (platform === null) {
    if (process.exitCode !== 1) console.error("Pick a platform: --blog, --x, or --linkedin.");
    process.exitCode = 1;
    return;
  }
  const accept = ctx.opts["accept"] === true;
  const reject = ctx.opts["reject"] === true;
  if (accept && reject) {
    console.error("Pick one: --accept or --reject, not both.");
    process.exitCode = 1;
    return;
  }

  const { dir, sha } = await resolveDraftDir(ctx.cwd, ctx.positional[0]);
  const draftBody = await readDraft(dir, platformDraftFile(platform));
  if (draftBody === null) {
    console.error(`No ${platform} draft for ${sha.slice(0, 8)} — generate one first.`);
    process.exitCode = 1;
    return;
  }

  let state = await readReviewState(dir, platform);
  if (!state) state = await initReview(dir, platform, draftBody);

  if (!accept && !reject) {
    console.log(`--- ${platformDraftFile(platform)} @ ${sha.slice(0, 8)} [${state.status}] ---`);
    console.log(draftBody.trimEnd() || "(empty)");
    console.log(`--- versions: ${state.versions.length}, decided: ${state.decidedAt ?? "never"} ---`);
    if (state.reason) console.log(`reason: ${state.reason}`);
    for (const [i, v] of state.versions.entries()) {
      if (v.preference) console.log(`v${i + 1} preference: ${v.preference}`);
    }
    return;
  }

  const reasonArg = ctx.opts["reason"];
  const reason = typeof reasonArg === "string" ? reasonArg : undefined;
  const groqKey = process.env["GROQ_KEY"] ?? "";
  // The preference call only fires on changed text; still needs a key then.
  const config = await loadConfig();
  const { state: next, preferenceAdded, globalRule } = await recordVerdict({
    dir,
    platform,
    fileContent: draftBody,
    accept,
    reason,
    summarizer: new GroqGenerator(groqKey, config.genModel),
  });
  console.log(
    accept
      ? `accepted ${platformDraftFile(platform)}${preferenceAdded ? " (text had changed — snapshotted + preference noted)" : ""}`
      : `rejected ${platformDraftFile(platform)}${preferenceAdded ? " (text had changed — snapshotted + preference noted)" : ""}`
  );
  if (next.reason) console.log(`reason: ${next.reason}`);
  if (globalRule) {
    const home = getTractHome();
    const res = await appendPreferenceRule(join(home, "preferences"), platformPreferenceFile(platform), globalRule);
    console.log(
      res === "appended"
        ? `platform rule saved to preferences/${platformPreferenceFile(platform)}`
        : res === "appended-rotated"
          ? `platform rule saved (oldest rule rotated out at cap ${MAX_PREFERENCE_RULES})`
          : `platform rule already known — skipped`
    );
  }
}

export const command: TractCommand = {
  name: "review",
  description: "show a draft and record accept/reject",
  args: [{ name: "sha", description: "commit to review (default HEAD)" }],
  options: [
    { flags: "--blog", description: "review the blog draft" },
    { flags: "--x", description: "review the X draft" },
    { flags: "--linkedin", description: "review the LinkedIn draft" },
    { flags: "--accept", description: "accept the current text" },
    { flags: "--reject", description: "reject the current text" },
    { flags: "--reason <text>", description: "why (required on reject, optional on accept)" },
  ],
  run,
};

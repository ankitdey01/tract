// `tract voice` — manage the global voice profile (~/.tract/voice/).

import { join } from "node:path";
import {
  getTractHome,
  appendVoiceSample,
  overwriteVoiceSample,
  clearVoiceFile,
  readVoiceFile,
  resolveVoiceFile,
  ensureVoiceFiles,
  VOICE_FILES,
} from "../../index.js";
import type { CommandContext, TractCommand } from "../router.js";
import type { VoiceFile } from "../../index.js";
import { selectedFlags } from "../helpers.js";

function voiceDir(): string {
  return join(getTractHome(), "voice");
}

/** Reads --voice/--blog/--x/--linkedin (commander rejects anything else). */
function platformFromOpts(ctx: CommandContext): VoiceFile | null {
  const pick = selectedFlags(ctx.opts, ["voice", "blog", "x", "linkedin"]);
  if (pick.length === 0) return null;
  if (pick.length > 1) {
    console.error(`One file at a time — pass one of --voice, --blog, --x, --linkedin (got ${pick.map((p) => `--${p}`).join(", ")}).`);
    process.exitCode = 1;
    return null;
  }
  return resolveVoiceFile(`--${pick[0]}`);
}

async function run(ctx: CommandContext): Promise<void> {
  const sub = ctx.positional[0];
  const dir = voiceDir();
  await ensureVoiceFiles(dir);

  if (sub === "view") {
    const file = platformFromOpts(ctx);
    if (process.exitCode === 1) return;
    if (file) {
      console.log(`--- ${file} ---`);
      console.log((await readVoiceFile(dir, file)) || "(empty)");
      return;
    }
    for (const f of VOICE_FILES) {
      console.log(`--- ${f} ---`);
      console.log((await readVoiceFile(dir, f)) || "(empty)");
    }
    return;
  }

  if (sub === "add" || sub === "create" || sub === "remove") {
    const file = platformFromOpts(ctx);
    if (process.exitCode === 1) return;
    if (!file) {
      console.error(`Specify a file: --voice, --blog, --x, or --linkedin. e.g. tract voice ${sub} --blog "<sample>"`);
      process.exitCode = 1;
      return;
    }
    if (sub === "remove") {
      await clearVoiceFile(dir, file);
      console.log(`cleared ${file}`);
      return;
    }
    const sample = ctx.positional.slice(1).join(" ");
    if (sub === "add") {
      const res = await appendVoiceSample(dir, file, sample);
      console.log(res === "appended" ? `appended to ${file}` : `already in ${file} — skipped`);
      return;
    }
    await overwriteVoiceSample(dir, file, sample);
    console.log(`overwrote ${file}`);
    return;
  }

  console.log("Usage: tract voice [add|create|remove|view] [--voice|--blog|--x|--linkedin] [\"<sample>\"]");
  process.exitCode = 1;
}

export const command: TractCommand = {
  name: "voice",
  description: "manage voice samples (add/create/remove/view)",
  args: [
    { name: "sub", description: "add | create | remove | view" },
    { name: "sample", description: "pasted sample (add/create)", variadic: true },
  ],
  options: [
    { flags: "--voice", description: "the default voice.md" },
    { flags: "--blog", description: "blog.md" },
    { flags: "--x", description: "x.md" },
    { flags: "--linkedin", description: "linkedin.md" },
  ],
  run,
};

// `tract preferences` — manage global platform taste rules (~/.tract/preferences/).
// Distilled automatically at review verdicts; curated by hand here.

import { join } from "node:path";
import {
  getTractHome,
  appendPreferenceRule,
  overwritePreferenceFile,
  clearPreferenceFile,
  readPreferenceFile,
  ensurePreferenceFiles,
  resolvePreferenceFile,
  PREFERENCE_FILES,
} from "../../index.js";
import type { CommandContext, TractCommand } from "../router.js";
import type { PreferenceFile } from "../../index.js";
import { selectedFlags } from "../helpers.js";

function preferencesDir(): string {
  return join(getTractHome(), "preferences");
}

/** Reads --blog/--x/--linkedin (commander rejects anything else). */
function platformFromOpts(ctx: CommandContext): PreferenceFile | null {
  const pick = selectedFlags(ctx.opts, ["blog", "x", "linkedin"]);
  if (pick.length === 0) return null;
  if (pick.length > 1) {
    console.error(`One file at a time — pass one of --blog, --x, --linkedin (got ${pick.map((p) => `--${p}`).join(", ")}).`);
    process.exitCode = 1;
    return null;
  }
  return resolvePreferenceFile(`--${pick[0]}`);
}

async function run(ctx: CommandContext): Promise<void> {
  const sub = ctx.positional[0];
  const dir = preferencesDir();
  await ensurePreferenceFiles(dir);

  if (sub === "view") {
    const file = platformFromOpts(ctx);
    if (process.exitCode === 1) return;
    if (file) {
      console.log(`--- ${file} ---`);
      console.log((await readPreferenceFile(dir, file)) || "(empty)");
      return;
    }
    for (const f of PREFERENCE_FILES) {
      console.log(`--- ${f} ---`);
      console.log((await readPreferenceFile(dir, f)) || "(empty)");
    }
    return;
  }

  if (sub === "add" || sub === "create" || sub === "remove") {
    const file = platformFromOpts(ctx);
    if (process.exitCode === 1) return;
    if (!file) {
      console.error(`Specify a file: --blog, --x, or --linkedin. e.g. tract preferences ${sub} --x "<rule>"`);
      process.exitCode = 1;
      return;
    }
    if (sub === "remove") {
      await clearPreferenceFile(dir, file);
      console.log(`cleared ${file}`);
      return;
    }
    const rule = ctx.positional.slice(1).join(" ");
    if (sub === "add") {
      const res = await appendPreferenceRule(dir, file, rule);
      console.log(
        res === "appended"
          ? `appended to ${file}`
          : res === "appended-rotated"
            ? `appended to ${file} (oldest rule rotated out at cap)`
            : `already in ${file} — skipped`
      );
      return;
    }
    await overwritePreferenceFile(dir, file, rule);
    console.log(`overwrote ${file}`);
    return;
  }

  console.log('Usage: tract preferences [add|create|remove|view] [--blog|--x|--linkedin] ["<rule>"]');
  process.exitCode = 1;
}

export const command: TractCommand = {
  name: "preferences",
  description: "manage global platform taste rules (add/create/remove/view)",
  args: [
    { name: "sub", description: "add | create | remove | view" },
    { name: "rule", description: "hand-written rule (add/create)", variadic: true },
  ],
  options: [
    { flags: "--blog", description: "blog.md" },
    { flags: "--x", description: "x.md" },
    { flags: "--linkedin", description: "linkedin.md" },
  ],
  run,
};

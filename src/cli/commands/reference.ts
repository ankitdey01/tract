// `tract reference` — manage real-post examples per platform (~/.tract/reference/).
// Mirrors `voice`: add appends, create overwrites, remove clears, view shows.

import { join } from "node:path";
import {
  getTractHome,
  appendReferenceExample,
  overwriteReferenceExample,
  clearReferenceFile,
  readReferenceFile,
  ensureReferenceFiles,
  platformReferenceFile,
  REFERENCE_FILES,
} from "../../index.js";
import type { CommandContext, TractCommand } from "../router.js";
import type { ReferenceFile } from "../../index.js";
import { selectedFlags } from "../helpers.js";

function referenceDir(): string {
  return join(getTractHome(), "reference");
}

/** Reads --blog/--x/--linkedin (commander rejects anything else). */
function platformFromOpts(ctx: CommandContext): ReferenceFile | null {
  const pick = selectedFlags(ctx.opts, ["blog", "x", "linkedin"]);
  if (pick.length === 0) return null;
  if (pick.length > 1) {
    console.error(`One file at a time — pass one of --blog, --x, --linkedin (got ${pick.map((p) => `--${p}`).join(", ")}).`);
    process.exitCode = 1;
    return null;
  }
  return platformReferenceFile(pick[0] as "blog" | "x" | "linkedin");
}

async function run(ctx: CommandContext): Promise<void> {
  const sub = ctx.positional[0];
  const dir = referenceDir();
  await ensureReferenceFiles(dir);

  if (sub === "view") {
    const file = platformFromOpts(ctx);
    if (process.exitCode === 1) return;
    if (file) {
      console.log(`--- ${file} ---`);
      console.log((await readReferenceFile(dir, file)) || "(empty)");
      return;
    }
    for (const f of REFERENCE_FILES) {
      console.log(`--- ${f} ---`);
      console.log((await readReferenceFile(dir, f)) || "(empty)");
    }
    return;
  }

  if (sub === "add" || sub === "create" || sub === "remove") {
    const file = platformFromOpts(ctx);
    if (process.exitCode === 1) return;
    if (!file) {
      console.error(`Specify a file: --blog, --x, or --linkedin. e.g. tract reference ${sub} --x "<post>"`);
      process.exitCode = 1;
      return;
    }
    if (sub === "remove") {
      await clearReferenceFile(dir, file);
      console.log(`cleared ${file}`);
      return;
    }
    const example = ctx.positional.slice(1).join(" ");
    if (sub === "add") {
      const res = await appendReferenceExample(dir, file, example);
      console.log(res === "appended" ? `appended to ${file}` : `already in ${file} — skipped`);
      return;
    }
    await overwriteReferenceExample(dir, file, example);
    console.log(`overwrote ${file}`);
    return;
  }

  console.log('Usage: tract reference [add|create|remove|view] [--blog|--x|--linkedin] ["<post>"]');
  process.exitCode = 1;
}

export const command: TractCommand = {
  name: "reference",
  description: "manage real-post examples (add/create/remove/view)",
  args: [
    { name: "sub", description: "add | create | remove | view" },
    { name: "example", description: "pasted real post (add/create)", variadic: true },
  ],
  options: [
    { flags: "--blog", description: "blog.md" },
    { flags: "--x", description: "x.md" },
    { flags: "--linkedin", description: "linkedin.md" },
  ],
  run,
};

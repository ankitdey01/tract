// `tract diff` — pre-commit preview of Jev input.

import { getDiffPreview } from "../../index.js";
import type { CommandContext, TractCommand } from "../router.js";

async function run(ctx: CommandContext): Promise<void> {
  const { diff, filesChanged, truncated } = await getDiffPreview(ctx.cwd, { stagedOnly: ctx.flags.staged });
  if (!diff.trim()) {
    console.log(ctx.flags.staged ? "No staged changes." : "No uncommitted changes vs HEAD (tracked files).");
    return;
  }
  console.log(`--- preview (${filesChanged.length} file(s)${truncated ? ", truncated" : ""}) ---`);
  console.log(diff);
}

export const command: TractCommand = {
  name: "diff",
  description: "pre-commit preview of Jev input",
  usage: "diff [--staged]",
  run,
};

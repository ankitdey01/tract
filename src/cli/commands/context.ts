// `tract context` — inspect the generation-ready context for a commit (no LLM).

import { loadOrGatherCommitContext } from "../../index.js";
import type { CommandContext, TractCommand } from "../router.js";

async function run(ctx: CommandContext): Promise<void> {
  const shaOrHead = ctx.positional[0];
  const asJson = ctx.opts["json"] === true;
  const { context: c, source } = await loadOrGatherCommitContext(ctx.cwd, shaOrHead ?? "HEAD");

  if (asJson) {
    console.log(JSON.stringify(c, null, 2));
    return;
  }

  const firstLine = (m: string | null) => (m === null || m === "" ? "(none)" : m.split("\n")[0]);
  console.log(`commit ${c.sha.slice(0, 8)} (${source})`);
  console.log(`message: ${firstLine(c.commitMessage)}`);
  console.log(`previous: ${c.previousSha === null ? "(none — root commit)" : `${c.previousSha.slice(0, 8)} — ${firstLine(c.previousCommitMessage)}`}`);
  console.log(`diff: ${c.shapedDiff.length} chars${c.diffTruncated ? " (truncated)" : ""} | files: ${c.files.length} | content: ${c.totalContentChars} chars`);
  for (const f of c.files) {
    const detail = f.included
      ? `${f.chars} chars${f.truncated ? " (truncated)" : ""}`
      : `omitted: ${f.omittedReason}`;
    console.log(`  ${f.status} ${f.path} (${detail})`);
  }
}

export const command: TractCommand = {
  name: "context",
  description: "show generation-ready context for a commit (no LLM)",
  args: [{ name: "sha", description: "commit to inspect (default HEAD)" }],
  options: [{ flags: "--json", description: "emit machine-readable JSON" }],
  run,
};

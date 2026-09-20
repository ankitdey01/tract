#!/usr/bin/env node
// CLI entry point. Bootstraps (~/.tract, .env), then file-routes to commands/*.
// All env/console/process access lives in cli/ — never inside core/.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTractHome } from "../index.js";
import { route } from "./router.js";

/** Loads TYPESAFE_API_KEY from cwd/.env if not already set. */
async function loadEnvFile(cwd: string): Promise<void> {
  if (process.env["TYPESAFE_API_KEY"]) return;
  let raw: string;
  try {
    raw = await readFile(join(cwd, ".env"), "utf8");
  } catch {
    return;
  }
  const m = raw.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (m) process.env["TYPESAFE_API_KEY"] = m[1].trim();
}

async function main(): Promise<void> {
  const cwd = process.cwd();

  // ~/.tract exists from the first tract invocation, whichever command it is.
  await ensureTractHome();
  await loadEnvFile(cwd);

  const commandsDir = join(dirname(fileURLToPath(import.meta.url)), "commands");
  process.exitCode = await route(process.argv, cwd, commandsDir);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

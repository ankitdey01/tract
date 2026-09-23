#!/usr/bin/env node
// CLI entry point. Bootstraps (~/.tract, .env), then runs the program.
// All env/console/process access lives in cli/ — never inside core/.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTractHome } from "../index.js";
import { runProgram } from "./router.js";

/** Loads known keys from cwd/.env if not already set. */
async function loadEnvFile(cwd: string): Promise<void> {
  if (process.env["TYPESAFE_API_KEY"] && process.env["GROQ_KEY"]) return;
  let raw: string;
  try {
    raw = await readFile(join(cwd, ".env"), "utf8");
  } catch {
    return;
  }
  for (const key of ["TYPESAFE_API_KEY", "GROQ_KEY"]) {
    if (process.env[key]) continue;
    const m = raw.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, "m"));
    if (m) process.env[key] = m[1].trim();
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();

  // ~/.tract exists from the first tract invocation, whichever command it is.
  await ensureTractHome();
  await loadEnvFile(cwd);

  let version = "0.0.0";
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    version =
      (JSON.parse(await readFile(join(here, "..", "..", "package.json"), "utf8")) as { version?: string }).version ??
      version;
  } catch {
    // Standalone runs outside the repo — version stays unknown.
  }
  await runProgram(process.argv, cwd, version);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

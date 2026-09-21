// File-routed commands: every commands/<name>.ts file exporting `command`
// (with a matching name) becomes a `tract <name>` command — no registry edits.
// A command that outgrows one file graduates to commands/<name>/command.ts,
// which the loader also accepts. CLI-only: argv/console/process live here.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface CommandContext {
  cwd: string;
  /** Raw argv after the command name (flags + positionals). */
  args: string[];
  flags: { staged: boolean; force: boolean };
  positional: string[];
}

export interface TractCommand {
  /** Folder name must match (e.g. commands/diff -> "diff"). */
  name: string;
  description: string;
  usage: string;
  run(ctx: CommandContext): Promise<void>;
}

/** Commands reserved for upcoming slices — friendly "not yet" instead of "unknown". */
const FUTURE = ["publish"] as const;

function parseArgs(raw: string[]): Omit<CommandContext, "cwd"> {
  return {
    args: raw,
    flags: { staged: raw.includes("--staged"), force: raw.includes("--force") },
    positional: raw.filter((a) => !a.startsWith("--")),
  };
}

/** Discovers command files (and graduated command folders) at runtime. */
export async function discoverCommands(commandsDir: string): Promise<Map<string, TractCommand>> {
  const found = new Map<string, TractCommand>();
  const take = (file: string, mod: { command?: TractCommand }) => {
    if (mod.command && mod.command.name === file && typeof mod.command.run === "function") {
      found.set(file, mod.command);
    }
  };
  try {
    const ds = await readdir(commandsDir, { withFileTypes: true });
    for (const d of ds.filter((x) => x.isFile() && x.name.endsWith(".js") && x.name !== "router.js").sort((a, b) => a.name.localeCompare(b.name))) {
      const name = d.name.slice(0, -3);
      try {
        take(name, (await import(pathToFileURL(join(commandsDir, d.name)).href)) as { command?: TractCommand });
      } catch {
        // Skip unloadable command files; `tract` still works for the rest.
      }
    }
    for (const d of ds.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        take(d.name, (await import(pathToFileURL(join(commandsDir, d.name, "command.js")).href)) as { command?: TractCommand });
      } catch {
        // Skip unloadable command folders; `tract` still works for the rest.
      }
    }
  } catch {
    return found;
  }
  return found;
}

export function helpText(commands: Map<string, TractCommand>): string {
  const rows = [...commands.values()].map((c) => `  tract ${c.usage.padEnd(28)} ${c.description}`);
  return [
    "tract — turn commits into drafts in your voice",
    "",
    ...rows,
    ...FUTURE.map((f) => `  tract ${f} ...${" ".padEnd(28 - f.length - 4)} next slice (not yet implemented)`),
    "",
    "Env: TYPESAFE_API_KEY (or cwd/.env) required unless --force",
  ].join("\n");
}

/** Parses argv, dispatches to the discovered command folder. Returns process exit code. */
export async function route(argv: string[], cwd: string, commandsDir: string): Promise<number> {
  const rest = argv.slice(2);
  const commands = await discoverCommands(commandsDir);
  const parsed = parseArgs(rest.slice(1));
  const ctx: CommandContext = { cwd, ...parsed };
  const name = rest[0] ?? "";

  if (!name) {
    console.log(helpText(commands));
    return 0;
  }
  const cmd = commands.get(name);
  if (cmd) {
    await cmd.run(ctx);
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }
  if ((FUTURE as readonly string[]).includes(name)) {
    console.log(`${name} slice not yet implemented — voice files live in ~/.tract/voice/.`);
    return 1;
  }
  console.log(`Unknown command: ${name}\n\n${helpText(commands)}`);
  return 1;
}

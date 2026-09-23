// Diff shaping: collapse noisy paths to filename-only so Jev sees the signal
// without the token burn. This shapes INPUT only — it never decides significance.

/** Directory prefixes whose file contents are collapsed (filenames still listed). */
export const IGNORED_DIR_PREFIXES: readonly string[] = [
  ".git/",
  ".agents/",
  "node_modules/",
  "dist/",
  "build/",
];

/** Exact filenames whose contents are collapsed (e.g. lockfiles, secrets). */
export const IGNORED_FILES: readonly string[] = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  ".env",
];

/** Suffixes collapsed regardless of directory (build artifacts). */
export const IGNORED_SUFFIXES: readonly string[] = [".map", ".lock"];

function ignored(path: string): boolean {
  const p = path.replace(/^\.\//, "");
  if (IGNORED_FILES.includes(p.split("/").pop() ?? "")) return true;
  if (IGNORED_SUFFIXES.some((s) => p.endsWith(s))) return true;
  if (p === ".env" || p.startsWith(".env.")) return true;
  return IGNORED_DIR_PREFIXES.some((d) => p === d.slice(0, -1) || p.startsWith(d));
}

/** True when a repo-relative path is noise: content collapses, filename stays. */
export function isIgnoredPath(path: string): boolean {
  return ignored(path);
}

function unquoteGitPath(p: string): string {
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    return p.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return p;
}

function stripGitPrefix(p: string): string | null {
  if (p === "/dev/null") return null;
  if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
  return p;
}

function sectionPaths(header: string): string[] {
  const m = header.match(/^diff --git ("(?:[^"\\]|\\.)+"|\S+) ("(?:[^"\\]|\\.)+"|\S+)/);
  if (!m) return [];
  const out: string[] = [];
  for (const raw of [m[1], m[2]]) {
    const stripped = stripGitPrefix(unquoteGitPath(raw));
    if (stripped !== null && !out.includes(stripped)) out.push(stripped);
  }
  return out;
}

/**
 * Collapses ignored files in a unified diff to a one-line placeholder.
 * Returns the shaped diff plus the list of collapsed paths.
 */
export function shapeDiffForJudge(rawDiff: string): { diff: string; collapsed: string[] } {
  const collapsed: string[] = [];
  const out: string[] = [];
  const lines = rawDiff.split("\n");
  let skipping = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const paths = sectionPaths(line);
      const ignoredHits = paths.filter((p) => ignored(p));
      skipping = ignoredHits.length > 0;
      if (skipping) {
        const display = paths[paths.length - 1] ?? ignoredHits[0];
        collapsed.push(...ignoredHits);
        out.push(line);
        out.push(`... [content collapsed: ${display} — filename only]`);
      } else {
        out.push(line);
      }
      continue;
    }
    if (!skipping) out.push(line);
  }

  return { diff: out.join("\n"), collapsed };
}

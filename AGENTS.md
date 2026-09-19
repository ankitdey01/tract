# AGENTS.md — Tract

`PRD.md` is the single source of truth for product, architecture, and decisions. `README.md` holds the system diagram. Read them before coding.

## Current state

Pre-scaffold: no `apps/`, `packages/`, workspace config, toolchain, tests, or CI yet. Root `package.json` is a stub (`npm test` just errors). Do not assume build/test/lint commands exist — if you scaffold them, follow the plan below.

## Planned architecture (from PRD §8, not yet built)

TypeScript monorepo, pnpm workspaces:

- `apps/cli` — Commander.js entrypoint (`tract`), ships first
- `apps/extension` — VS Code extension, thin wrapper over `core`, ships second
- `packages/core` — git/diff, significance filter, context + prompt builders, LLM provider, voice/feedback stores, storage adapter
- `packages/shared` — types (`Commit`, `Diff`, `Draft`, `VoiceProfile`, `Platform`)
- `packages/core/src/index.ts` is the **only** import surface for `cli`/`extension`; never import `core` internals directly
- `core` has zero VS Code / CLI deps. `LLMProvider` and `StorageAdapter` are swappable interfaces (mock in tests). Secrets (`.env` for CLI, `vscode.SecretStorage` for extension) are passed into `core` as constructor args, never read inside `core`
- Tests: Vitest, `*.test.ts` colocated with source; bulk of coverage in `core`
- Build order: monorepo scaffold → git plumbing → significance filter → voice loader → generation → CLI output → publish → feedback loop → extension (PRD §14)

## Non-negotiable product decisions

- Draft-first always: never post/publish without the user seeing and editing the draft first.
- No platform publishing APIs in v1: X = `x.com/intent/tweet?text=...` URL (true one-click); LinkedIn/Medium = copy + open compose page + manual paste (no prefill URL exists). Reflect this asymmetry honestly.
- Significance filter: heuristic pre-pass (lockfiles, format-only, trivial diffs) → LLM judgment with 2–3s timeout → fallback "generate anyway" so a hung call never stalls. For demos, pre-test the demo diff's judgment.
- CLI surface: `tract generate`, `tract voice add <file>`, `tract post --platform x`.

## Skills

- Vendored in `.agents/skills/`: `typesafe-ai`, `bulk-classify` (classifier.dev), plus engineering workflow skills.
- Before using TypeSafe or classifier.dev, read the skill's `SKILL.md` and the live docs — do not guess APIs/structures:
  - TypeSafe: https://docs.typesafe.ai/llms.txt
  - classifier.dev: https://classifier.dev/llms.txt
- `bulk-classify` is a candidate for the heuristic/cascade pre-filter in the significance filter (filter diffs/files without pulling everything into context).

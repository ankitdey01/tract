# AGENTS.md — Tract

The following instrucions and PRD.md doesnt solely represent the final product. You have complete right to cross question me and suggest me better workaround if needed and valid.
Below is just a rough sketch of the overall product.

`PRD.md` is the single source of truth for product, design flow, and decisions. `README.md` holds the system diagram. Read them before coding. Stack is decided: TypeScript + Node (see `package.json`, `tsconfig.json`, `src/`). Do not re-litigate it; decide only what is still open during build.

## Coding Rule

Don't overcomplicate, instead do smart engineering changes. Dont over engineer stuffs that require simple work.

## Current state

Scaffolded: TypeScript + Node CLI (`src/`, `tsconfig.json`, `npm run build`). Significance slice live (`tract diff`, `tract generate` with Jev gate). Voice, generation, publish slices still open. Test/eval harness deferred (PRD §14.9). Do not assume test/lint/CI commands exist.

## Design flow (from PRD §8, implementation TBD)

Capability pipeline, in order: diff/commit extraction → significance filter → context building (diff + README + voice) → generation → human review → publish → feedback loop into voice profile.

- Engine is UI-agnostic: interfaces call it, it never depends on them. Simplest terminal-native surface ships first; editor integration later.
- LLM provider and storage are swappable behind interfaces (mock in tests). No provider or backend hardcoded. Secrets are passed into the engine as inputs, never read inside it.
- Coverage lives where the logic lives (significance, context, generation, voice/feedback).

## Build discipline (non-negotiable workflow)

Build one capability slice at a time, then stop. Verify it live with the user before starting the next slice. Take feedback, improve the slice, then move forward. Never stack untested slices or jump ahead to generation/publish/feedback while the current slice is unverified.

## Non-negotiable product decisions

- Draft-first always: never post/publish without the user seeing and editing the draft first.
- No platform publishing APIs in v1: X = `x.com/intent/tweet?text=...` URL (true one-click); LinkedIn/Medium = copy + open compose page + manual paste (no prefill URL exists). Reflect this asymmetry honestly.
- Significance filter: Jev-only (`is_significant` Noul via `@typesafe-ai/sdk`, `jev-latest`). No heuristic pre-pass. `tract generate --force` bypasses. For demos, pre-test the demo diff's Jev verdict.

## Skills

- Vendored in `.agents/skills/`: `typesafe-ai`, `bulk-classify` (classifier.dev), plus engineering workflow skills.
- Before using TypeSafe or classifier.dev, read the skill's `SKILL.md` and the live docs — do not guess APIs/structures:
  - TypeSafe: https://docs.typesafe.ai/llms.txt
  - classifier.dev: https://classifier.dev/llms.txt
- Significance uses TypeSafe Jev only — `bulk-classify` is NOT in the significance path (retired heuristic/cascade idea).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `ankitdey01/tract` (uses `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

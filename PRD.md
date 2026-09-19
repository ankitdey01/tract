# Tract — Product Requirements Document

**Status:** Pre-release, first commit. This document is the single source of truth for product, architecture, and decisions made so far.

## 1. Name & Positioning

- **Name:** Tract — double meaning: a short written work, and the tracking function of git.
- **Tagline:** *"Claude reviews your code. Tract writes about it."*
- **Core value prop:** it just knows who you are, how you talk, and what you're building — no re-explaining your identity/context every time you want to post about your work.

## 2. Problem

Developers building in public need to consistently write about their work to build an audience (X, LinkedIn, blog, YouTube), but writing is time-consuming, feels like a context-switch away from actual building, and gets deprioritized. Existing "commit-to-post" tools solve the mechanical trigger (commit → post) but not the identity problem — they either produce generic changelog-style copy or market a vague "AI learns your voice" claim with no concrete mechanism.

## 3. Target User

Solo/indie developers building in public with an existing or growing social presence (example anchor case discussed: an X account with ~10k monthly engagement), who currently write posts manually and inconsistently because of the time/context-switch cost. Social presence and engagement are treated as an increasingly important asset for developers going forward.

## 4. Goals

- Generate content in 4 formats from a single trigger: Blog (word-count controlled), X Post, LinkedIn Post, YouTube video script
- Match the user's actual voice, not a generic AI tone
- Filter for significance — don't generate content for every trivial commit
- Keep a human in the loop before anything is posted (draft-first, non-negotiable)
- Continuously improve voice matching from real usage signal
- CLI-first, VS Code extension second — meets developers where they already work, ships the cheaper/lower-risk surface first

## 5. Non-Goals (v1)

- Autonomous publishing without human review — every publish path still ends with the user taking the final action themselves on the platform
- True API-based auto-publish to any platform — no OAuth flows, no paid API tiers, no app review processes in v1. Publishing is browser-based (see Section 7.5)
- Fine-tuned models — v1 uses few-shot prompting against stored voice samples, not model fine-tuning
- Multi-repo/team accounts — v1 is single-user, local-first

## 6. Non-negotiable Product Decisions (decision log)

- **Draft-first, always.** A "Post" button is allowed, but only ever appears after the user has seen and can edit the draft. No silent/autonomous posting, ever.
- **No direct platform APIs for publishing in v1.** Rejected in favor of browser share-intents after discovering the real cost/friction: X posting via API requires a paid developer tier; LinkedIn write-scopes require app review; neither is worth it when a browser-based flow works for free.
- **CLI ships before the VS Code extension.** The extension is a thin UI wrapper around the same `core` engine — building CLI-first proves the engine works before adding UI complexity.
- **`core` has zero VS Code or CLI dependency.** Both callers depend on it; it never depends on them. This is what makes the engine portable (future JetBrains plugin, GitHub Action, etc.) and testable without spinning up an editor.

## 7. Core Features

### 7.1 Trigger Layer
- Git post-commit hook
- Manual command (`tract generate`)
- Scheduled digest (future, not v1)

### 7.2 Significance Filter
- Heuristic pre-pass first (skip lockfiles, formatting-only diffs, trivially small changes) — cheap, fast, catches obvious noise before spending an LLM call
- LLM-judged significance check for everything that survives the heuristic pass
- Hard timeout (2–3s) with fallback to "generate anyway" if the check times out or errors — this exists specifically so a live demo (or any real usage) never stalls on a hung API call
- Rehearsal note: for any live/demo use, test the actual diff being used ahead of time so the significance judgment behavior is already known, not discovered live

### 7.3 Voice Profile
- Seeded at onboarding from user-provided past posts (`tract voice add <file>`)
- Stored locally (SQLite/JSON), used as few-shot context in generation prompts
- Auto-improves from three signals, all feeding the same feedback store:
  1. **Implicit** — diff between generated draft and what the user actually edited / or latest commit (if first commit)
  2. **Explicit** — accept/reject on each draft
  3. **Manual** — user re-pastes new samples to recalibrate
- **Open, unresolved question:** is the voice profile global per-user, or scoped per-repo/project? A solo dev's tone for client work vs. a personal project vs. an OSS contribution may need to differ. Needs a decision before the data model is locked.
- **Cold-start problem, acknowledged but not fully solved:** a brand-new user with no past posts either has to paste several samples upfront (friction) or gets generic output until enough signal accumulates (mediocre first impression). For hackathon/demo purposes, resolved by pre-seeding real posts before demo day — not yet solved for a genuine first-time user in production.

### 7.4 Generation
- Input: diff + commit context + README (where available) + voice profile + target platform
- Output: 1–2 draft candidates per format, all 4 formats generated per trigger
- Blog format includes a configurable target word count

### 7.5 Review
- CLI: drafts printed to terminal / written to a local file (v1)
- VS Code extension (later): webview panel with edit/approve/regenerate/reject actions

### 7.6 Publish — asymmetric by platform, intentionally
- **X**: genuine one-click. Uses the public compose-intent URL (`x.com/intent/tweet?text=...`) which truly pre-fills the post text. No auth, no API, no app registration.
- **LinkedIn**: no public API/URL exists to pre-fill personal post text (their share URLs only pre-fill a link preview, not free-form post content). Flow: copy content to clipboard, open LinkedIn's compose page in a new tab, user pastes manually.
- **Medium**: same limitation as LinkedIn — no compose-prefill URL exists at all, public or documented. Same copy + open + manual paste flow.
- This asymmetry should be reflected honestly in product messaging — X is a true one-click; LinkedIn/Medium are "we got you 90% of the way there."

## 8. Architecture

TypeScript monorepo, pnpm workspaces.

```
apps/
  cli/            — commander.js entrypoint (bin: tract), ships first
  extension/      — VS Code extension, wraps the same core, ships second
packages/
  core/           — git diff extraction, significance filter, context builder,
                    prompt builder, LLM provider interface (Claude implementation),
                    voice profile store, feedback store, storage adapter interface
  shared/         — shared types (Commit, Diff, Draft, VoiceProfile, Platform)
```

- `core/src/index.ts` is the only public import surface — internals are never imported directly by `cli` or `extension`
- `LLMProvider` is an interface, not hardcoded to Claude — swappable, mockable in tests
- `StorageAdapter` is an interface, default implementation SQLite — swappable, mockable in tests
- Secrets: `vscode.SecretStorage` for the extension, env vars/`.env` for the CLI — never plain settings files, never read directly by `core` (passed in as constructor args to stay UI-agnostic and testable)
- Testing convention: colocate `*.test.ts` next to source, Vitest; `core` carries the bulk of test coverage since it's where the actual logic lives

See `architecture.mermaid` (embedded in README.md) for the full system diagram.

## 9. Tech Stack

- TypeScript (monorepo, pnpm workspaces)
- Node.js + Commander.js (CLI)
- VS Code Extension API (phase 2)
- simple-git (diff/commit parsing)
- Anthropic Claude API (generation + significance judging)
- SQLite (local voice-profile + feedback storage)
- Git (native — no GitHub API/webhook dependency)

## 10. CLI Command Surface (initial)

- `tract generate` — run the pipeline against the current repo's latest commit(s)
- `tract voice add <file>` — seed/update the voice profile with a writing sample
- `tract post --platform x` — open the browser with the X intent URL pre-filled for the latest approved draft

## 11. Competitive Landscape

| Tool | What it does | How Tract differs |
|---|---|---|
| CommitLore | Reads diffs, generates Twitter/LinkedIn/blog content, manual trigger, $12/mo | Cloud/GitHub-webhook + OAuth based. No YouTube-script format. |
| CommitStream | Commit → X/LinkedIn posts, markets "AI learns your voice" | Same cloud/webhook model; "learns your voice" has no specified mechanism. Tract's is a named 3-signal loop. |
| Posterly (Ship & Share) | GitHub-commit-to-post as one feature of a broader scheduling platform | Built for scheduled multi-platform auto-publish, not a draft-first developer tool |
| Postgit / SideProjectBuddy | Commit → tweet/LinkedIn pipelines, GitHub-connected | Same cloud/OAuth pattern |

**Core differentiation:** every competitor found is a cloud SaaS requiring GitHub OAuth. Tract is local-first and editor/CLI-native — works on uncommitted or private-repo work without granting any third party repo access, and runs in the same session where the code was written. None of the competitors surfaced a live "is this worth posting" judgment step as a first-class feature, and none offer a YouTube-script format.

## 12. Business Model (draft, not finalized)

- Free tier: shared/limited LLM API budget
- Pro tier: bring-your-own API key or subscription — unlimited generation, all 4 formats, extension access
- Future: team/agency tier for dev-relations teams managing multiple repos' public presence
- Pricing numbers and break-even math: not yet defined — needs real cost-per-generation modeling against Claude API pricing

## 13. Success Metrics (draft, needs real targets)

- % of generated drafts posted with minimal edits (proxy for voice-match quality)
- Number of generation triggers per active user per week (proxy for habit formation)
- Retention after first week (does the tool survive the cold-start mediocrity period)

## 14. Build Phases

0. Scaffold monorepo, CLI skeleton
1. Git plumbing — diff/commit extraction
2. Significance filter (heuristic pre-filter + LLM judgment, timeout+fallback)
3. Voice profile loader (`tract voice add`)
4. Generation — prompt builder + Claude call, all 4 formats
5. CLI output (terminal display / file write)
6. Publish — X intent URL (v1 target), LinkedIn/Medium copy+open (stretch)
7. Feedback loop — persist edit/accept/reject signal, feed back into voice profile
8. VS Code extension — same core, adds review webview

## 15. Hackathon Demo Plan

- Voice profile pre-loaded with real past posts before demo day — no live calibration, no cold-start risk on stage
- Live demo flow: real commit made live → LLM significance check → all 4 formats generated → post via X intent URL, live, on stage
- Significance filter runs LLM-judged (not heuristic-only) for the demo, specifically because it's the more impressive path — mitigated by the timeout+fallback described in 7.2
- Dogfooding note: whether the live commit is against Tract's own repo (showing the tool write about itself being built) or a separate demo repo is a presentation choice, not yet locked

## 16. Open Questions

- Voice profile scope: global per-user vs. per-project (Section 7.3)
- Real, verified statistics for the business/impact case are not yet sourced — competitor-published engagement stats must not be used as Tract's own supporting facts
- Pricing model numbers not yet modeled against actual API costs
- Team name/branding beyond the product name "Tract" not yet finalized

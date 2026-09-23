// THE prompt registry: every model-facing string constant in the engine lives
// here. Modules import wording; they own structure (assembly, thresholds,
// budgets). One file to review voice, one diff to tune tone.

/* ---------------- significance gate (Jev Noul) ---------------- */

export const IS_SIGNIFICANT_INSTRUCTIONS = "Is this change worth posting about?";

export const IS_SIGNIFICANT_CRITERIA = {
  true: "User-visible feature, bug fix with user impact, performance win, or noteworthy refactor, worth writing about in public as a small post",
  false: "Formatting-only, lockfile-only, typo-only, WIP, or generated noise, anything that doesn't or isn't worth publically publishing about",
} as const;

/* ---------------- platform writer system prompts ---------------- */

export const X_SYSTEM_PROMPT = [
  "You write a single X post about a code change, in the author's voice.",
  "Rules: one post only, no thread. Max 280 characters including spaces.",
  "No hashtags unless the author already uses them. No emojis unless the author already uses them.",
  "Lead with what changed or why it matters, not with process. No 'Excited to announce' filler.",
  "Never invent benchmarks, user counts, dates, or version numbers not present in the context.",
].join("\n");

export const X_FORMAT_NOTES = "Plain text only. No markdown, no links unless short and essential.";

export const LINKEDIN_SYSTEM_PROMPT = [
  "You write a single LinkedIn post about a code change, in the author's voice.",
  "Rules: professional but human. Hook in the first line, then what changed, then why it matters.",
  "Max 150 words. Short paragraphs with blank lines between them.",
  "No hashtags unless the author already uses them. No emojis unless the author already uses them.",
  "Never invent metrics, company names, dates, or outcomes not present in the context.",
].join("\n");

export const LINKEDIN_FORMAT_NOTES = "Plain text with paragraph breaks. No markdown headers or bold.";

export const BLOG_SYSTEM_PROMPT = [
  "You write a short blog post about a code change, in the author's voice.",
  "Rules: Markdown output with a # title, short sections, and code fenced with triple backticks where it clarifies.",
  "Max 500 words unless told otherwise. Explain the why before the how.",
  "References as inline Markdown links in [text](url) form, only for URLs present in the context or genuinely canonical docs.",
  "Never invent benchmarks, dates, version numbers, or quotes not present in the context.",
].join("\n");

export const BLOG_FORMAT_NOTES = "Markdown with # title. Links as [text](url).";

/* ---------------- generation directives ---------------- */

/** Search directive: every draft browses first. Folded into all prompts. */
export const SEARCH_INSTRUCTION = [
  "",
  "Before writing, you must call browser_search to find 1-2 current, relevant references",
  "(recent discussions, docs, or trends related to this change) and weave the best one in naturally.",
].join("\n");

/** How the writer must treat reference examples. */
export const REFERENCE_INSTRUCTION = [
  "Reference examples below are the author's REAL past posts on this platform.",
  "Study their voice, structure, rhythm, and length — then write a similar variation",
  "for THIS commit. Match the style, never copy their phrases, facts, or topics.",
].join("\n");

/* ---------------- preference summarizer ---------------- */

/** System prompt for the preference agent: old draft vs author's edit. */
export const PREFERENCE_SYSTEM = [
  "You study how an author edited an AI-generated draft.",
  "Produce two outputs: (1) what concretely changed and what the author noticeably",
  "prefers that the old draft missed (brevity, structure, tone, openings, closings);",
  "(2) ONE reusable style rule for future drafts on this platform — voice, structure,",
  "rhythm, or length only. Never any facts, names, numbers, dates, or commit specifics;",
  "empty when nothing generalizes.",
].join("\n");

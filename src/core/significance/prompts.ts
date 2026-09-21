// All hardcoded model prompts for the significance slice live here — never inline.
// Future slices follow the same rule: prompts live next to their module
// (core/context/prompts.ts, core/generation/prompts.ts), logic imports them.

export const IS_SIGNIFICANT_INSTRUCTIONS = "Is this change worth posting about?";

export const IS_SIGNIFICANT_CRITERIA = {
  true: "User-visible feature, bug fix with user impact, performance win, or noteworthy refactor",
  false: "Formatting-only, lockfile-only, typo-only, WIP, or generated noise",
} as const;

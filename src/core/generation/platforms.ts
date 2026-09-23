// Platform prompt modules: checked-in system prompts + hard constraints.
// One file per platform; generation assembles them with context + voice in code.

import type { Platform } from "../../shared/types.js";
import {
  X_SYSTEM_PROMPT,
  X_FORMAT_NOTES,
  LINKEDIN_SYSTEM_PROMPT,
  LINKEDIN_FORMAT_NOTES,
  BLOG_SYSTEM_PROMPT,
  BLOG_FORMAT_NOTES,
} from "../prompts.js";

export interface PlatformSpec {
  platform: Platform;
  file: `${Platform}.md`;
  systemPrompt: string;
  /** Human-readable limit, e.g. "280 characters" or "500 words". */
  limit: string;
  formatNotes: string;
}

export const X_SPEC: PlatformSpec = {
  platform: "x",
  file: "x.md",
  systemPrompt: X_SYSTEM_PROMPT,
  limit: "280 characters",
  formatNotes: X_FORMAT_NOTES,
};

export const LINKEDIN_SPEC: PlatformSpec = {
  platform: "linkedin",
  file: "linkedin.md",
  systemPrompt: LINKEDIN_SYSTEM_PROMPT,
  limit: "150 words",
  formatNotes: LINKEDIN_FORMAT_NOTES,
};

export const BLOG_SPEC: PlatformSpec = {
  platform: "blog",
  file: "blog.md",
  systemPrompt: BLOG_SYSTEM_PROMPT,
  limit: "500 words",
  formatNotes: BLOG_FORMAT_NOTES,
};

const SPECS: Record<Platform, PlatformSpec> = {
  x: X_SPEC,
  linkedin: LINKEDIN_SPEC,
  blog: BLOG_SPEC,
};

export function platformSpec(platform: Platform): PlatformSpec {
  return SPECS[platform];
}

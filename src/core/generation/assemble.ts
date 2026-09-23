// Prompt assembly: deterministic. Template + CommitContext + paired voice.
// No model call here — single-stage generation carries the full raw context.

import type { CommitContext } from "../context/index.js";
import type { Platform } from "../../shared/types.js";
import { REFERENCE_INSTRUCTION, SEARCH_INSTRUCTION } from "../prompts.js";
import { platformSpec } from "./platforms.js";

export interface AssembledPrompt {
  system: string;
  prompt: string;
}

/** File-content budget for one prompt (diff itself is always whole). */
export const MAX_PROMPT_CONTENT_CHARS = 8_000;

function renderFiles(c: CommitContext, budget: number = MAX_PROMPT_CONTENT_CHARS): string {
  let spent = 0;
  return c.files
    .map((f) => {
      const label = f.previousPath ? `${f.status} ${f.previousPath} -> ${f.path}` : `${f.status} ${f.path}`;
      if (!f.included) return `- ${label} (content omitted: ${f.omittedReason})`;
      const remaining = budget - spent;
      if (remaining <= 0) return `- ${label} (content omitted: budget)`;
      let content = f.content ?? "";
      let note = `${f.chars} chars${f.truncated ? ", truncated" : ""}`;
      if (content.length > remaining) {
        content = content.slice(0, remaining) + "\n... [content cut: prompt budget]";
        note = "cut: prompt budget";
      }
      spent += content.length;
      return `- ${label} (${note}):\n${content}`;
    })
    .join("\n\n");
}

export function assemblePrompt(
  platform: Platform,
  context: CommitContext,
  voiceDefault: string,
  voicePlatform: string,
  reference: string,
  preferences: string[],
  globalPreferences: string[]
): AssembledPrompt {
  const spec = platformSpec(platform);
  const system = [
    spec.systemPrompt,
    "",
    "Author's default voice (always applies):",
    voiceDefault.trim() || "(no default voice samples yet)",
    "",
    `Author's ${platform} voice (applies on top of the default):`,
    voicePlatform.trim() || "(no platform voice samples yet)",
  ].join("\n");

  const prompt = [
    `Write one ${platform} draft about the commit below. Max ${spec.limit}. ${spec.formatNotes}`,
    "",
    `Commit: ${context.sha.slice(0, 8)}`,
    `Message: ${context.commitMessage || "(empty)"}`,
    context.previousCommitMessage ? `Previous commit message: ${context.previousCommitMessage.split("\n")[0]}` : "Previous commit: none (root commit).",
    "",
    "Diff:",
    context.shapedDiff || "(empty diff)",
    "",
    "Changed files:",
    renderFiles(context),
    "",
    "Learned preferences (from the author's past edits on this commit — apply these):",
    preferences.length > 0 ? preferences.map((p, i) => `${i + 1}. ${p}`).join("\n") : "(none yet)",
    "",
    "Platform taste rules (learned across all commits — always apply):",
    globalPreferences.length > 0 ? globalPreferences.map((p, i) => `${i + 1}. ${p}`).join("\n") : "(none yet)",
    "",
    REFERENCE_INSTRUCTION,
    reference.trim() || "(no reference examples yet)",
    SEARCH_INSTRUCTION,
  ].join("\n");

  return { system, prompt };
}

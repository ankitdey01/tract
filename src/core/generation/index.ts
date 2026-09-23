// Engine: draft generation. Own thin interface; Vercel AI SDK + Groq underneath.
// Secrets (apiKey) passed in, never read here. Single-stage: full context in.

import { generateText, Output } from "ai";
import { z } from "zod";
import { createGroq, groq, type GroqLanguageModelChatOptions } from "@ai-sdk/groq";
import type { CommitContext } from "../context/index.js";
import type { Platform } from "../../shared/types.js";
import { assemblePrompt } from "./assemble.js";
import { platformSpec } from "./platforms.js";
import { PREFERENCE_SYSTEM } from "../prompts.js";

export interface GenerateInput {
  platform: Platform;
  context: CommitContext;
  voiceDefault: string;
  voicePlatform: string;
  reference: string;
  /** Learned preference summaries from this commit's review history. */
  preferences: string[];
  /** Platform taste rules learned across commits (~/.tract/preferences/). */
  globalPreferences: string[];
}

export interface DraftResult {
  platform: Platform;
  body: string;
  model: string;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Unified stop reason from the SDK final step: stop | length | content-filter | tool-calls | error | other. */
  finishReason: string;
  /** Raw provider stop reason (e.g. model limit reached). Null when the provider sends none. */
  rawFinishReason: string | null;
  /** Number of SDK steps taken (browse + text). Lets empty drafts be told apart from short ones. */
  steps: number;
  /** Provider warnings for all steps (e.g. unsupported settings). Empty when none. */
  warnings: unknown[];
}

export interface Generator {
  generate(input: GenerateInput): Promise<DraftResult>;
  /** Raw single-shot text call (no tools): small jobs. */
  complete(system: string, prompt: string): Promise<string>;
  /**
   * Dual-output edit summary: commit-episodic preference + platform-global rule.
   * Structured so the two land in different stores; degrades to commit-only
   * when the model can't do schema (globalRule "").
   */
  summarizePreference(oldContent: string, newContent: string): Promise<PreferencePair>;
}

export interface PreferencePair {
  /** What makes THIS text good (goes on the new review version). */
  commitPreference: string;
  /** Style-only rule for all future drafts (goes to preferences/<platform>.md). Empty when nothing generalizes. */
  globalRule: string;
}

const PreferencePairSchema = z.object({
  commitPreference: z.string().describe("What concretely changed and what the author noticeably prefers that the old draft missed. 150 words or less, plain text."),
  globalRule: z
    .string()
    .describe("ONE reusable style rule for this platform learned from the edit (voice, structure, rhythm, length). No facts, names, numbers, or commit specifics. Empty string when nothing generalizes."),
});

export class GroqGenerator implements Generator {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async generate(input: GenerateInput): Promise<DraftResult> {
    const provider = this.apiKey ? createGroq({ apiKey: this.apiKey }) : groq;
    const { system, prompt } = assemblePrompt(input.platform, input.context, input.voiceDefault, input.voicePlatform, input.reference, input.preferences, input.globalPreferences);
    const started = Date.now();
    // Note: no toolChoice — browser_search is provider-executed, so the model
    // never emits an SDK-visible tool call; `required` would always throw.
    const result = await generateText({
      model: provider(this.model),
      system,
      prompt,
      tools: { browser_search: groq.tools.browserSearch({}) },
      // Browse sessions bill as input tokens (observed 600k+ on high effort).
      // Low effort keeps search useful without torching the daily quota.
      providerOptions: {
        groq: { reasoningEffort: "medium" } satisfies GroqLanguageModelChatOptions,
      },
    });
    return {
      platform: input.platform,
      body: result.text.trim(),
      model: this.model,
      ms: Date.now() - started,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      finishReason: result.finishReason,
      rawFinishReason: result.rawFinishReason ?? null,
      steps: result.steps.length,
      warnings: result.warnings ?? [],
    };
  }

  async complete(system: string, prompt: string): Promise<string> {
    const provider = this.apiKey ? createGroq({ apiKey: this.apiKey }) : groq;
    const result = await generateText({ model: provider(this.model), system, prompt });
    return result.text.trim();
  }

  async summarizePreference(oldContent: string, newContent: string): Promise<PreferencePair> {
    const provider = this.apiKey ? createGroq({ apiKey: this.apiKey }) : groq;
    const system = PREFERENCE_SYSTEM;
    const prompt = ["OLD DRAFT (what the model wrote):", oldContent, "", "NEW DRAFT (the author's edited version):", newContent].join("\n");
    try {
      const result = await generateText({
        model: provider(this.model),
        system,
        prompt,
        output: Output.object({ schema: PreferencePairSchema }),
      });
      return {
        commitPreference: result.output.commitPreference.trim().slice(0, 1000),
        globalRule: result.output.globalRule.trim().slice(0, 500),
      };
    } catch {
      // Schema path unsupported — degrade to a single commit preference, no global rule.
      const fallback = await this.complete(system, prompt);
      return { commitPreference: fallback.slice(0, 1000), globalRule: "" };
    }
  }
}

export function platformDraftFile(platform: Platform): `${Platform}.md` {
  return platformSpec(platform).file;
}

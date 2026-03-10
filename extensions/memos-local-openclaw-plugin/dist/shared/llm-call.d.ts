import type { SummarizerConfig, Logger, PluginContext } from "../types";
/**
 * Build a SummarizerConfig from OpenClaw's native model configuration (openclaw.json).
 * Final fallback when both strongCfg and plugin summarizer fail or are absent.
 */
export declare function loadOpenClawFallbackConfig(log: Logger): SummarizerConfig | undefined;
/**
 * Build the ordered fallback chain for skill-related LLM calls:
 *   skillEvolution.summarizer → plugin summarizer → OpenClaw native model
 */
export declare function buildSkillConfigChain(ctx: PluginContext): SummarizerConfig[];
export interface LLMCallOptions {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}
/**
 * Make a single LLM call with the given config. Throws on failure.
 */
export declare function callLLMOnce(cfg: SummarizerConfig, prompt: string, opts?: LLMCallOptions): Promise<string>;
/**
 * Call LLM with fallback chain: tries each config in order until one succeeds.
 * Returns the result string, or throws if ALL configs fail.
 */
export declare function callLLMWithFallback(chain: SummarizerConfig[], prompt: string, log: Logger, label: string, opts?: LLMCallOptions): Promise<string>;
//# sourceMappingURL=llm-call.d.ts.map
import type { SummarizerConfig, Logger } from "../../types";
import type { FilterResult, DedupResult } from "./openai";
export type { FilterResult, DedupResult } from "./openai";
export declare class Summarizer {
    private cfg;
    private log;
    private strongCfg;
    private fallbackCfg;
    constructor(cfg: SummarizerConfig | undefined, log: Logger, strongCfg?: SummarizerConfig);
    /**
     * Ordered config chain: strongCfg → cfg → fallbackCfg (OpenClaw native model).
     * Returns configs that are defined, in priority order.
     */
    private getConfigChain;
    /**
     * Try calling fn with each config in the chain until one succeeds.
     * Returns undefined if all fail.
     */
    private tryChain;
    summarize(text: string): Promise<string>;
    summarizeTask(text: string): Promise<string>;
    judgeNewTopic(currentContext: string, newMessage: string): Promise<boolean | null>;
    filterRelevant(query: string, candidates: Array<{
        index: number;
        summary: string;
        role: string;
    }>): Promise<FilterResult | null>;
    judgeDedup(newSummary: string, candidates: Array<{
        index: number;
        summary: string;
        chunkId: string;
    }>): Promise<DedupResult | null>;
    getStrongConfig(): SummarizerConfig | undefined;
}
//# sourceMappingURL=index.d.ts.map
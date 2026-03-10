import type { SummarizerConfig, Logger } from "../../types";
export declare function summarizeTaskGemini(text: string, cfg: SummarizerConfig, log: Logger): Promise<string>;
export declare function judgeNewTopicGemini(currentContext: string, newMessage: string, cfg: SummarizerConfig, log: Logger): Promise<boolean>;
import type { FilterResult } from "./openai";
export type { FilterResult } from "./openai";
export declare function filterRelevantGemini(query: string, candidates: Array<{
    index: number;
    summary: string;
    role: string;
}>, cfg: SummarizerConfig, log: Logger): Promise<FilterResult>;
export declare function summarizeGemini(text: string, cfg: SummarizerConfig, log: Logger): Promise<string>;
import type { DedupResult } from "./openai";
export type { DedupResult } from "./openai";
export declare function judgeDedupGemini(newSummary: string, candidates: Array<{
    index: number;
    summary: string;
    chunkId: string;
}>, cfg: SummarizerConfig, log: Logger): Promise<DedupResult>;
//# sourceMappingURL=gemini.d.ts.map
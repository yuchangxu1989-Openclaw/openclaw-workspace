import type { SummarizerConfig, Logger } from "../../types";
export declare function summarizeTaskOpenAI(text: string, cfg: SummarizerConfig, log: Logger): Promise<string>;
export declare function summarizeOpenAI(text: string, cfg: SummarizerConfig, log: Logger): Promise<string>;
export declare function judgeNewTopicOpenAI(currentContext: string, newMessage: string, cfg: SummarizerConfig, log: Logger): Promise<boolean>;
export interface FilterResult {
    relevant: number[];
    sufficient: boolean;
}
export declare function filterRelevantOpenAI(query: string, candidates: Array<{
    index: number;
    summary: string;
    role: string;
}>, cfg: SummarizerConfig, log: Logger): Promise<FilterResult>;
export declare const DEDUP_JUDGE_PROMPT = "You are a memory deduplication system.\n\nLANGUAGE RULE (MUST FOLLOW): You MUST reply in the SAME language as the input memories. \u5982\u679C\u8F93\u5165\u662F\u4E2D\u6587\uFF0Creason \u548C mergedSummary \u5FC5\u987B\u7528\u4E2D\u6587\u3002If input is English, reply in English. This applies to ALL text fields in your JSON output.\n\nGiven a NEW memory summary and several EXISTING memory summaries, determine the relationship.\n\nFor each EXISTING memory, the NEW memory is either:\n- \"DUPLICATE\": NEW conveys the same intent/meaning as an EXISTING memory, even if worded differently. Examples: \"\u8BF7\u544A\u8BC9\u6211\u4F60\u7684\u540D\u5B57\" vs \"\u4F60\u5E0C\u671B\u6211\u600E\u4E48\u79F0\u547C\u4F60\"; \"\u65B0\u4F1A\u8BDD\u5DF2\u5F00\u59CB\" vs \"New session started\"; greetings with minor variations. If the core information/intent is the same, it IS a duplicate.\n- \"UPDATE\": NEW contains meaningful additional information that supplements an EXISTING memory (new data, status change, concrete detail not present before)\n- \"NEW\": NEW covers a genuinely different topic/event with no semantic overlap\n\nIMPORTANT: Lean toward DUPLICATE when memories share the same intent, topic, or factual content. Only choose NEW when the topics are truly unrelated. Repetitive conversational patterns (greetings, session starts, identity questions, capability descriptions) across different sessions should be treated as DUPLICATE.\n\nPick the BEST match among all candidates. If none match well, choose \"NEW\".\n\nOutput a single JSON object (reason and mergedSummary MUST match input language):\n- If DUPLICATE: {\"action\":\"DUPLICATE\",\"targetIndex\":2,\"reason\":\"\u4E0E\u5DF2\u6709\u8BB0\u5FC6\u610F\u56FE\u76F8\u540C\"}\n- If UPDATE: {\"action\":\"UPDATE\",\"targetIndex\":3,\"reason\":\"\u65B0\u8BB0\u5FC6\u8865\u5145\u4E86\u989D\u5916\u7EC6\u8282\",\"mergedSummary\":\"\u5408\u5E76\u540E\u7684\u5B8C\u6574\u6458\u8981\uFF0C\u4FDD\u7559\u65B0\u65E7\u6240\u6709\u4FE1\u606F\"}\n- If NEW: {\"action\":\"NEW\",\"reason\":\"\u4E0D\u540C\u4E3B\u9898\uFF0C\u65E0\u5173\u8054\"}\n\nOutput ONLY the JSON object, no other text.";
export interface DedupResult {
    action: "DUPLICATE" | "UPDATE" | "NEW";
    targetIndex?: number;
    reason: string;
    mergedSummary?: string;
}
export declare function judgeDedupOpenAI(newSummary: string, candidates: Array<{
    index: number;
    summary: string;
    chunkId: string;
}>, cfg: SummarizerConfig, log: Logger): Promise<DedupResult>;
export declare function parseDedupResult(raw: string, log: Logger): DedupResult;
//# sourceMappingURL=openai.d.ts.map
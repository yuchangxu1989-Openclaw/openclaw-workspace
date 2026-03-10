export type Role = "user" | "assistant" | "system" | "tool";
export interface ConversationMessage {
    role: Role;
    content: string;
    timestamp: number;
    turnId: string;
    sessionKey: string;
    toolName?: string;
    owner?: string;
}
export type DedupStatus = "active" | "duplicate" | "merged";
export interface Chunk {
    id: string;
    sessionKey: string;
    turnId: string;
    seq: number;
    role: Role;
    content: string;
    kind: ChunkKind;
    summary: string;
    embedding: number[] | null;
    taskId: string | null;
    skillId: string | null;
    owner: string;
    dedupStatus: DedupStatus;
    dedupTarget: string | null;
    dedupReason: string | null;
    mergeCount: number;
    lastHitAt: number | null;
    mergeHistory: string;
    createdAt: number;
    updatedAt: number;
}
export type TaskStatus = "active" | "completed" | "skipped";
export interface Task {
    id: string;
    sessionKey: string;
    title: string;
    summary: string;
    status: TaskStatus;
    owner: string;
    startedAt: number;
    endedAt: number | null;
    updatedAt: number;
}
export type ChunkKind = "paragraph" | "code_block" | "error_stack" | "command" | "list" | "mixed" | "tool_result";
export interface ChunkRef {
    sessionKey: string;
    chunkId: string;
    turnId: string;
    seq: number;
}
export interface SearchHit {
    summary: string;
    original_excerpt: string;
    ref: ChunkRef;
    score: number;
    taskId: string | null;
    skillId: string | null;
    owner?: string;
    source: {
        ts: number;
        role: Role;
        sessionKey: string;
    };
}
export interface SkillSearchHit {
    skillId: string;
    name: string;
    description: string;
    owner: string;
    visibility: SkillVisibility;
    score: number;
    reason: string;
}
export interface SearchResult {
    hits: SearchHit[];
    meta: {
        usedMinScore: number;
        usedMaxResults: number;
        totalCandidates: number;
        note?: string;
    };
}
export interface TimelineEntry {
    excerpt: string;
    ref: ChunkRef;
    role: Role;
    ts: number;
    relation: "before" | "current" | "after";
}
export interface TimelineResult {
    entries: TimelineEntry[];
    anchorRef: ChunkRef;
}
export interface GetResult {
    content: string;
    ref: ChunkRef;
    source: {
        ts: number;
        role: Role;
        sessionKey: string;
    };
}
export interface RankedCandidate {
    chunkId: string;
    ftsScore: number | null;
    vecScore: number | null;
    rrfScore: number;
    mmrScore: number;
    recencyScore: number;
    finalScore: number;
}
export type SummaryProvider = "openai" | "openai_compatible" | "anthropic" | "gemini" | "azure_openai" | "bedrock";
export type EmbeddingProvider = "openai" | "openai_compatible" | "gemini" | "azure_openai" | "cohere" | "mistral" | "voyage" | "local";
export interface ProviderConfig {
    provider: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    temperature?: number;
}
export interface SummarizerConfig extends ProviderConfig {
    provider: SummaryProvider;
}
export interface EmbeddingConfig extends ProviderConfig {
    provider: EmbeddingProvider;
    batchSize?: number;
    dimensions?: number;
    retry?: number;
}
export type SkillStatus = "active" | "archived" | "draft";
export type SkillUpgradeType = "create" | "refine" | "extend" | "fix";
export type TaskSkillRelation = "generated_from" | "evolved_from" | "applied_to";
export type SkillVisibility = "private" | "public";
export interface Skill {
    id: string;
    name: string;
    description: string;
    version: number;
    status: SkillStatus;
    tags: string;
    sourceType: "task" | "manual";
    dirPath: string;
    installed: number;
    owner: string;
    visibility: SkillVisibility;
    qualityScore: number | null;
    createdAt: number;
    updatedAt: number;
}
export interface SkillVersion {
    id: string;
    skillId: string;
    version: number;
    content: string;
    changelog: string;
    changeSummary: string;
    upgradeType: SkillUpgradeType;
    sourceTaskId: string | null;
    metrics: string;
    qualityScore: number | null;
    createdAt: number;
}
export interface SkillGenerateOutput {
    skill_md: string;
    scripts: Array<{
        filename: string;
        content: string;
    }>;
    references: Array<{
        filename: string;
        content: string;
    }>;
    evals: Array<{
        id: number;
        prompt: string;
        expectations: string[];
    }>;
}
export interface TaskSkillLink {
    taskId: string;
    skillId: string;
    relation: TaskSkillRelation;
    versionAt: number;
    createdAt: number;
}
export interface SkillEvolutionConfig {
    enabled?: boolean;
    autoEvaluate?: boolean;
    minChunksForEval?: number;
    minConfidence?: number;
    maxSkillLines?: number;
    autoInstall?: boolean;
    summarizer?: SummarizerConfig;
}
export interface TelemetryConfig {
    enabled?: boolean;
    posthogApiKey?: string;
    posthogHost?: string;
}
export interface MemosLocalConfig {
    summarizer?: SummarizerConfig;
    embedding?: EmbeddingConfig;
    storage?: {
        dbPath?: string;
    };
    recall?: {
        maxResultsDefault?: number;
        maxResultsMax?: number;
        minScoreDefault?: number;
        minScoreFloor?: number;
        rrfK?: number;
        mmrLambda?: number;
        recencyHalfLifeDays?: number;
        /** Cap vector search to this many most recent chunks. 0 = no cap (search all; may get slower with 200k+ chunks). If you set a cap for performance, use a large value (e.g. 200000–300000) so older memories are still in the window; FTS always searches all. */
        vectorSearchMaxChunks?: number;
    };
    dedup?: {
        similarityThreshold?: number;
    };
    capture?: {
        evidenceWrapperTag?: string;
    };
    skillEvolution?: SkillEvolutionConfig;
    telemetry?: TelemetryConfig;
}
export declare const DEFAULTS: {
    readonly maxResultsDefault: 6;
    readonly maxResultsMax: 20;
    readonly minScoreDefault: 0.45;
    readonly minScoreFloor: 0.35;
    readonly rrfK: 60;
    readonly mmrLambda: 0.7;
    readonly recencyHalfLifeDays: 14;
    readonly vectorSearchMaxChunks: 0;
    readonly dedupSimilarityThreshold: 0.6;
    readonly evidenceWrapperTag: "STORED_MEMORY";
    readonly excerptMinChars: 200;
    readonly excerptMaxChars: 500;
    readonly getMaxCharsDefault: 2000;
    readonly getMaxCharsMax: 8000;
    readonly timelineWindowDefault: 2;
    readonly localEmbeddingModel: "Xenova/all-MiniLM-L6-v2";
    readonly localEmbeddingDimensions: 384;
    readonly toolResultMaxChars: 2000;
    readonly taskIdleTimeoutMs: number;
    readonly taskSummaryMaxTokens: 2000;
    readonly skillEvolutionEnabled: true;
    readonly skillAutoEvaluate: true;
    readonly skillMinChunksForEval: 6;
    readonly skillMinConfidence: 0.7;
    readonly skillMaxLines: 400;
    readonly skillAutoInstall: false;
};
export interface PluginContext {
    stateDir: string;
    workspaceDir: string;
    config: MemosLocalConfig;
    log: Logger;
}
export interface Logger {
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
}
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (input: Record<string, unknown>) => Promise<unknown>;
}
//# sourceMappingURL=types.d.ts.map
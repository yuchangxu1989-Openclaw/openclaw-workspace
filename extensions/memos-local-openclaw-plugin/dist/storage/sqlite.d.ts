import type { Chunk, ChunkRef, Task, TaskStatus, Skill, SkillStatus, SkillVisibility, SkillVersion, TaskSkillRelation, Logger } from "../types";
export declare class SqliteStore {
    private log;
    private db;
    constructor(dbPath: string, log: Logger);
    private migrate;
    private migrateChunksIndexesForRecall;
    private migrateOwnerFields;
    private migrateSkillVisibility;
    private migrateSkillEmbeddingsAndFts;
    private migrateTaskId;
    private migrateContentHash;
    private migrateSkillTables;
    private migrateSkillId;
    private migrateSkillQualityScore;
    private migrateTaskSkillMeta;
    setTaskSkillMeta(taskId: string, meta: {
        skillStatus: string;
        skillReason: string;
    }): void;
    getTasksBySkillStatus(statuses: string[]): Task[];
    private migrateMergeFields;
    private migrateApiLogs;
    private migrateDedupStatus;
    recordApiLog(toolName: string, input: unknown, output: string, durationMs: number, success: boolean): void;
    getApiLogs(limit?: number, offset?: number, toolFilter?: string): {
        logs: Array<{
            id: number;
            toolName: string;
            input: string;
            output: string;
            durationMs: number;
            success: boolean;
            calledAt: number;
        }>;
        total: number;
    };
    getApiLogToolNames(): string[];
    recordMergeHit(chunkId: string, action: "DUPLICATE" | "UPDATE", reason: string, oldSummary?: string, newSummary?: string): void;
    updateChunkSummaryAndContent(chunkId: string, newSummary: string, appendContent: string): void;
    private migrateToolCalls;
    recordToolCall(toolName: string, durationMs: number, success: boolean): void;
    getToolMetrics(minutes: number): {
        tools: string[];
        series: Array<{
            minute: string;
            [tool: string]: number | string;
        }>;
        aggregated: Array<{
            tool: string;
            totalCalls: number;
            avgMs: number;
            p95Ms: number;
            errorCount: number;
        }>;
    };
    /** Record a viewer API call for analytics (list, search, etc.). */
    recordViewerEvent(eventType: string): void;
    /**
     * Return metrics for the last N days: writes per day (from chunks), viewer calls per day.
     */
    getMetrics(days: number): {
        writesPerDay: Array<{
            date: string;
            count: number;
        }>;
        viewerCallsPerDay: Array<{
            date: string;
            list: number;
            search: number;
            total: number;
        }>;
        roleBreakdown: Record<string, number>;
        kindBreakdown: Record<string, number>;
        totals: {
            memories: number;
            sessions: number;
            embeddings: number;
            todayWrites: number;
            todayViewerCalls: number;
        };
    };
    insertChunk(chunk: Chunk): void;
    markDedupStatus(chunkId: string, status: "duplicate" | "merged", targetChunkId: string | null, reason: string): void;
    updateSummary(chunkId: string, summary: string): void;
    upsertEmbedding(chunkId: string, vector: number[]): void;
    deleteEmbedding(chunkId: string): void;
    getChunk(chunkId: string): Chunk | null;
    getChunkForOwners(chunkId: string, ownerFilter?: string[]): Chunk | null;
    getChunksByRef(ref: ChunkRef, ownerFilter?: string[]): Chunk | null;
    getNeighborChunks(sessionKey: string, turnId: string, seq: number, window: number, ownerFilter?: string[]): Chunk[];
    ftsSearch(query: string, limit: number, ownerFilter?: string[]): Array<{
        chunkId: string;
        score: number;
    }>;
    patternSearch(patterns: string[], opts?: {
        role?: string;
        limit?: number;
    }): Array<{
        chunkId: string;
        content: string;
        role: string;
        createdAt: number;
    }>;
    getAllEmbeddings(ownerFilter?: string[]): Array<{
        chunkId: string;
        vector: number[];
    }>;
    getRecentEmbeddings(limit: number, ownerFilter?: string[]): Array<{
        chunkId: string;
        vector: number[];
    }>;
    getEmbedding(chunkId: string): number[] | null;
    updateChunk(chunkId: string, fields: {
        summary?: string;
        content?: string;
        role?: string;
        kind?: string;
        owner?: string;
    }): boolean;
    deleteChunk(chunkId: string): boolean;
    deleteSession(sessionKey: string): number;
    deleteAll(): number;
    deleteTask(taskId: string): boolean;
    deleteSkill(skillId: string): boolean;
    insertTask(task: Task): void;
    getTask(taskId: string): Task | null;
    getActiveTask(sessionKey: string, owner?: string): Task | null;
    hasTaskForSession(sessionKey: string): boolean;
    hasSkillForSessionTask(sessionKey: string): boolean;
    getCompletedTasksForSession(sessionKey: string): Task[];
    getAllActiveTasks(owner?: string): Task[];
    updateTask(taskId: string, fields: {
        title?: string;
        summary?: string;
        status?: TaskStatus;
        endedAt?: number;
    }): boolean;
    getChunksByTask(taskId: string): Chunk[];
    listTasks(opts?: {
        status?: string;
        limit?: number;
        offset?: number;
        owner?: string;
    }): {
        tasks: Task[];
        total: number;
    };
    countChunksByTask(taskId: string): number;
    setChunkTaskId(chunkId: string, taskId: string): void;
    getUnassignedChunks(sessionKey: string, owner?: string): Chunk[];
    /**
     * Check if a chunk with the same (session_key, role, content_hash) already exists.
     * Uses indexed content_hash for O(1) lookup to prevent duplicate ingestion
     * when agent_end sends the full conversation history every turn.
     */
    chunkExistsByContent(sessionKey: string, role: string, content: string): boolean;
    /**
     * Find an active chunk with the same content_hash within the same owner (agent dimension).
     * Returns the existing chunk ID if found, null otherwise.
     */
    findActiveChunkByHash(content: string, owner?: string): string | null;
    getRecentChunkIds(limit: number): string[];
    countChunks(): number;
    insertSkill(skill: Skill): void;
    getSkill(skillId: string): Skill | null;
    getSkillByName(name: string): Skill | null;
    updateSkill(skillId: string, fields: {
        description?: string;
        version?: number;
        status?: SkillStatus;
        installed?: number;
        qualityScore?: number | null;
        updatedAt?: number;
    }): void;
    listSkills(opts?: {
        status?: string;
    }): Skill[];
    setSkillVisibility(skillId: string, visibility: SkillVisibility): void;
    upsertSkillEmbedding(skillId: string, vector: number[]): void;
    getSkillEmbedding(skillId: string): number[] | null;
    getSkillEmbeddings(scope: "self" | "public" | "mix", currentOwner: string): Array<{
        skillId: string;
        vector: number[];
    }>;
    skillFtsSearch(query: string, limit: number, scope: "self" | "public" | "mix", currentOwner: string): Array<{
        skillId: string;
        score: number;
    }>;
    listPublicSkills(): Skill[];
    insertSkillVersion(sv: SkillVersion): void;
    getLatestSkillVersion(skillId: string): SkillVersion | null;
    getSkillVersions(skillId: string): SkillVersion[];
    getSkillVersion(skillId: string, version: number): SkillVersion | null;
    linkTaskSkill(taskId: string, skillId: string, relation: TaskSkillRelation, versionAt: number): void;
    getSkillsByTask(taskId: string): Array<{
        skill: Skill;
        relation: TaskSkillRelation;
        versionAt: number;
    }>;
    getTasksBySkill(skillId: string): Array<{
        task: Task;
        relation: TaskSkillRelation;
    }>;
    countSkills(status?: string): number;
    setChunkSkillId(chunkId: string, skillId: string): void;
    getDistinctSessionKeys(): string[];
    getSessionOwnerMap(sessionKeys: string[]): Map<string, string>;
    close(): void;
}
//# sourceMappingURL=sqlite.d.ts.map
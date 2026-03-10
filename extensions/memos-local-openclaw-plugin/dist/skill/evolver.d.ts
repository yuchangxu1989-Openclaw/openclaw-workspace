import type { SqliteStore } from "../storage/sqlite";
import type { RecallEngine } from "../recall/engine";
import type { Embedder } from "../embedding";
import type { Task, PluginContext } from "../types";
export declare class SkillEvolver {
    private store;
    private engine;
    private ctx;
    private embedder?;
    private evaluator;
    private generator;
    private upgrader;
    private installer;
    private processing;
    private queue;
    constructor(store: SqliteStore, engine: RecallEngine, ctx: PluginContext, embedder?: Embedder | undefined);
    recoverOrphanedTasks(): Promise<number>;
    onTaskCompleted(task: Task): Promise<void>;
    private drain;
    private processOne;
    private process;
    /** Max candidates to send to LLM for relevance judgment. */
    private static readonly RELATED_SKILL_CANDIDATE_TOP;
    /**
     * Search for an existing skill that is HIGHLY related to the given task.
     *
     * 1. Collect top 50 skill candidates by FTS + vector similarity (relaxed thresholds).
     * 2. Call LLM with task title/summary and each skill's name/description; strict rule:
     *    only output ONE skill index if the task clearly belongs to that skill's domain;
     *    otherwise output 0 (do not force a match).
     */
    private findRelatedSkill;
    /**
     * Ask LLM to pick at most ONE skill that is HIGHLY relevant to the task.
     * Strict rule: only return a skill if the task clearly belongs to that skill's domain; otherwise return null.
     */
    private judgeSkillRelatedToTask;
    private parseJudgeSkillResult;
    private handleExistingSkill;
    private handleNewSkill;
    private markChunksWithSkill;
    private readSkillContent;
}
//# sourceMappingURL=evolver.d.ts.map
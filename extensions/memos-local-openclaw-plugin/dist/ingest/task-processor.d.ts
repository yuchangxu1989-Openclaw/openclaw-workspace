import type { SqliteStore } from "../storage/sqlite";
import type { PluginContext, Task } from "../types";
/**
 * Asynchronous task-level processor.
 *
 * After each ingestion batch, checks whether the current conversation
 * constitutes a "new task" compared to the previous one. If so:
 *   1. Finalizes the previous task (generates a detailed summary).
 *   2. Creates a new active task for incoming chunks.
 *
 * Task boundary detection:
 *   - Session change → always new task
 *   - Time gap > 2h → always new task
 *   - LLM judges whether new user message starts a different topic
 */
export declare class TaskProcessor {
    private store;
    private ctx;
    private summarizer;
    private processing;
    private pendingEvents;
    private drainPromise;
    private onTaskCompletedCallback?;
    constructor(store: SqliteStore, ctx: PluginContext);
    onTaskCompleted(cb: (task: Task) => void): void;
    /**
     * Called after new chunks are ingested.
     * Determines if a new task boundary was crossed and handles transition.
     */
    onChunksIngested(sessionKey: string, latestTimestamp: number, owner?: string): Promise<void>;
    private drainPending;
    private detectAndProcess;
    /**
     * Process unassigned chunks one user-turn at a time.
     *
     * Strategy:
     * - Need at least 1 user turn in the current task before starting LLM judgment
     *   (0 turns = no reference point for comparison).
     * - Each subsequent user turn is individually checked against the full task context.
     * - Time gap > 2h always triggers a split regardless of topic.
     */
    private processChunksIncrementally;
    /**
     * Group chunks into user-turns: each turn starts with a user message
     * and includes all subsequent non-user messages until the next user message.
     */
    private groupIntoTurns;
    /**
     * Build context from existing task chunks for the LLM topic judge.
     * Includes both the task's opening topic and recent exchanges,
     * so the LLM understands both what the task was originally about
     * and where the conversation currently is.
     *
     * For user messages, include full content (up to 500 chars) since
     * they carry the topic signal. For assistant messages, use summary
     * or truncated content since they mostly elaborate.
     */
    private buildContextSummary;
    private createNewTaskReturn;
    private createNewTask;
    private assignChunksToTask;
    private assignUnassignedChunks;
    finalizeTask(task: Task): Promise<void>;
    /**
     * Determine if a task is too trivial to warrant an LLM summary call.
     * Returns a skip reason string, or null if summary should proceed.
     *
     * Skip conditions (any one triggers skip):
     *  1. Total chunks < 4 — too few messages to form a meaningful task
     *  2. Real conversation turns < 2 — no back-and-forth dialogue
     *  3. No user messages — purely system/tool generated, no user intent
     *  4. Total content < 200 chars — not enough substance
     *  5. User content is trivial/test data — "hello", "test", "ok" etc.
     *  6. All messages are tool results — automated output, no conversation
     *  7. High content repetition — user repeated the same thing (debug loops)
     */
    private shouldSkipSummary;
    private looksLikeTrivialContent;
    private buildConversationText;
    /**
     * Extract the LLM-generated title from the summary output.
     * The LLM is prompted to output "📌 Title\n<title text>" as the first section.
     * Returns the title and the remaining body (with the title section stripped).
     */
    private parseTitleFromSummary;
    private extractTitle;
    private humanReadableSkipReason;
    private fallbackSummary;
}
//# sourceMappingURL=task-processor.d.ts.map
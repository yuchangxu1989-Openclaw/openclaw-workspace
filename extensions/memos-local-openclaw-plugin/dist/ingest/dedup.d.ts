import type { SqliteStore } from "../storage/sqlite";
import type { Logger } from "../types";
/**
 * Check if a new summary embedding is a near-duplicate of any
 * existing embedding. If similarity >= threshold, return the
 * existing chunk ID to merge/update instead of creating a new entry.
 *
 * PRD §4.4: dedup threshold 0.92–0.95
 */
export declare function findDuplicate(store: SqliteStore, newVec: number[], threshold: number, log: Logger, ownerFilter?: string[]): string | null;
/**
 * Find Top-N most similar chunks above a threshold.
 * Used for smart dedup: retrieve candidates, then ask LLM to judge.
 */
export declare function findTopSimilar(store: SqliteStore, newVec: number[], threshold: number, topN: number, log: Logger, ownerFilter?: string[]): Array<{
    chunkId: string;
    score: number;
}>;
//# sourceMappingURL=dedup.d.ts.map
import type { SqliteStore } from "../storage/sqlite";
/**
 * Maximal Marginal Relevance (PRD §5.3)
 *
 * Re-ranks candidates to balance relevance with diversity,
 * preventing top-K results from being too similar.
 *
 * MMR = λ · sim(q, d) - (1-λ) · max(sim(d, d_selected))
 */
export declare function mmrRerank(candidates: Array<{
    id: string;
    score: number;
}>, store: SqliteStore, lambda?: number, topK?: number): Array<{
    id: string;
    score: number;
}>;
//# sourceMappingURL=mmr.d.ts.map
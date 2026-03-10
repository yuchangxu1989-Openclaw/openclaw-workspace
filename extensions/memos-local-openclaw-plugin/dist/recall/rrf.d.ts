/**
 * Reciprocal Rank Fusion (PRD §5.2)
 *
 * Merges ranked lists from different retrieval sources (FTS, vector)
 * into a single ranking. Handles score scale mismatch between BM25
 * and cosine similarity.
 *
 * RRF(d) = Σ 1 / (k + rank_i(d))
 * where k is a constant (default 60) and rank_i is the rank in list i.
 */
export interface RankedItem {
    id: string;
    score: number;
}
export declare function rrfFuse(lists: RankedItem[][], k?: number): Map<string, number>;
//# sourceMappingURL=rrf.d.ts.map
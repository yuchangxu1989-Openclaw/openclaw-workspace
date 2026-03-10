import type { SqliteStore } from "./sqlite";
export declare function cosineSimilarity(a: number[], b: number[]): number;
export interface VectorHit {
    chunkId: string;
    score: number;
}
/**
 * Brute-force vector search over stored embeddings.
 * When maxChunks > 0, only searches the most recent maxChunks chunks (uses index; avoids full scan as data grows).
 */
export declare function vectorSearch(store: SqliteStore, queryVec: number[], topK: number, maxChunks?: number, ownerFilter?: string[]): VectorHit[];
//# sourceMappingURL=vector.d.ts.map
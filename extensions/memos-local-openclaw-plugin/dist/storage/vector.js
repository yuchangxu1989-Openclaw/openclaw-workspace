"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cosineSimilarity = cosineSimilarity;
exports.vectorSearch = vectorSearch;
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
/**
 * Brute-force vector search over stored embeddings.
 * When maxChunks > 0, only searches the most recent maxChunks chunks (uses index; avoids full scan as data grows).
 */
function vectorSearch(store, queryVec, topK, maxChunks, ownerFilter) {
    const all = maxChunks != null && maxChunks > 0
        ? store.getRecentEmbeddings(maxChunks, ownerFilter)
        : store.getAllEmbeddings(ownerFilter);
    const scored = all.map((row) => ({
        chunkId: row.chunkId,
        score: cosineSimilarity(queryVec, row.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
//# sourceMappingURL=vector.js.map
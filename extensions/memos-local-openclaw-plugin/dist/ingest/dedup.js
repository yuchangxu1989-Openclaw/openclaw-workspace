"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findDuplicate = findDuplicate;
exports.findTopSimilar = findTopSimilar;
const vector_1 = require("../storage/vector");
/**
 * Check if a new summary embedding is a near-duplicate of any
 * existing embedding. If similarity >= threshold, return the
 * existing chunk ID to merge/update instead of creating a new entry.
 *
 * PRD §4.4: dedup threshold 0.92–0.95
 */
function findDuplicate(store, newVec, threshold, log, ownerFilter) {
    const all = store.getAllEmbeddings(ownerFilter);
    let bestId = null;
    let bestScore = 0;
    for (const { chunkId, vector } of all) {
        const sim = (0, vector_1.cosineSimilarity)(newVec, vector);
        if (sim > bestScore) {
            bestScore = sim;
            bestId = chunkId;
        }
    }
    if (bestId && bestScore >= threshold) {
        log.debug(`Dedup: found duplicate chunk=${bestId} sim=${bestScore.toFixed(4)}`);
        return bestId;
    }
    return null;
}
/**
 * Find Top-N most similar chunks above a threshold.
 * Used for smart dedup: retrieve candidates, then ask LLM to judge.
 */
function findTopSimilar(store, newVec, threshold, topN, log, ownerFilter) {
    const all = store.getAllEmbeddings(ownerFilter);
    const scored = [];
    for (const { chunkId, vector } of all) {
        const sim = (0, vector_1.cosineSimilarity)(newVec, vector);
        if (sim >= threshold) {
            scored.push({ chunkId, score: sim });
        }
    }
    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(0, topN);
    if (result.length > 0) {
        log.debug(`findTopSimilar: found ${result.length} candidates above ${threshold} (best=${result[0].score.toFixed(4)})`);
    }
    return result;
}
//# sourceMappingURL=dedup.js.map
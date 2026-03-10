"use strict";
// ─── Role & Message ───
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULTS = void 0;
// ─── Defaults ───
exports.DEFAULTS = {
    maxResultsDefault: 6,
    maxResultsMax: 20,
    minScoreDefault: 0.45,
    minScoreFloor: 0.35,
    rrfK: 60,
    mmrLambda: 0.7,
    recencyHalfLifeDays: 14,
    vectorSearchMaxChunks: 0,
    dedupSimilarityThreshold: 0.60,
    evidenceWrapperTag: "STORED_MEMORY",
    excerptMinChars: 200,
    excerptMaxChars: 500,
    getMaxCharsDefault: 2000,
    getMaxCharsMax: 8000,
    timelineWindowDefault: 2,
    localEmbeddingModel: "Xenova/all-MiniLM-L6-v2",
    localEmbeddingDimensions: 384,
    toolResultMaxChars: 2000,
    taskIdleTimeoutMs: 2 * 60 * 60 * 1000, // 2 hour gap → new task
    taskSummaryMaxTokens: 2000,
    skillEvolutionEnabled: true,
    skillAutoEvaluate: true,
    skillMinChunksForEval: 6,
    skillMinConfidence: 0.7,
    skillMaxLines: 400,
    skillAutoInstall: false,
};
//# sourceMappingURL=types.js.map
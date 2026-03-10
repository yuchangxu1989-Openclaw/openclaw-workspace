"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemoryTimelineTool = createMemoryTimelineTool;
const types_1 = require("../types");
function resolveOwnerFilter(owner) {
    const resolvedOwner = typeof owner === "string" && owner.trim().length > 0 ? owner : "agent:main";
    return resolvedOwner === "public" ? ["public"] : [resolvedOwner, "public"];
}
function createMemoryTimelineTool(store) {
    return {
        name: "memory_timeline",
        description: "Retrieve neighboring context around a memory reference. Use after memory_search to expand context " +
            "around a specific hit. Provides adjacent conversation chunks marked as before/current/after.",
        inputSchema: {
            type: "object",
            properties: {
                ref: {
                    type: "object",
                    description: "Reference object from a memory_search hit (must contain sessionKey, chunkId, turnId, seq).",
                    properties: {
                        sessionKey: { type: "string" },
                        chunkId: { type: "string" },
                        turnId: { type: "string" },
                        seq: { type: "number" },
                    },
                    required: ["sessionKey", "chunkId", "turnId", "seq"],
                },
                window: {
                    type: "number",
                    description: "Number of turns/chunks to include before and after (default ±2).",
                },
            },
            required: ["ref"],
        },
        handler: async (input) => {
            const ref = input.ref;
            const window = input.window ?? types_1.DEFAULTS.timelineWindowDefault;
            const ownerFilter = resolveOwnerFilter(input.owner);
            const anchorChunk = store.getChunksByRef(ref, ownerFilter);
            if (!anchorChunk) {
                return { entries: [], anchorRef: ref };
            }
            const neighbors = store.getNeighborChunks(ref.sessionKey, ref.turnId, ref.seq, window, ownerFilter);
            const entries = neighbors.map((chunk) => {
                let relation = "before";
                if (chunk.id === ref.chunkId) {
                    relation = "current";
                }
                else if (chunk.createdAt > anchorChunk.createdAt) {
                    relation = "after";
                }
                return {
                    excerpt: chunk.content.slice(0, types_1.DEFAULTS.excerptMaxChars),
                    ref: {
                        sessionKey: chunk.sessionKey,
                        chunkId: chunk.id,
                        turnId: chunk.turnId,
                        seq: chunk.seq,
                    },
                    role: chunk.role,
                    ts: chunk.createdAt,
                    relation,
                };
            });
            const result = {
                entries,
                anchorRef: ref,
            };
            return result;
        },
    };
}
//# sourceMappingURL=memory-timeline.js.map
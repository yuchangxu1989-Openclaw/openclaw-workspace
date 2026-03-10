"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemoryGetTool = createMemoryGetTool;
const types_1 = require("../types");
function resolveOwnerFilter(owner) {
    const resolvedOwner = typeof owner === "string" && owner.trim().length > 0 ? owner : "agent:main";
    return resolvedOwner === "public" ? ["public"] : [resolvedOwner, "public"];
}
function createMemoryGetTool(store) {
    return {
        name: "memory_get",
        description: "Retrieve the full original text of a specific memory chunk. Use after memory_search or memory_timeline " +
            "when you need to see the complete content (not just the excerpt). Useful for verifying exact details.",
        inputSchema: {
            type: "object",
            properties: {
                ref: {
                    type: "object",
                    description: "Reference object from a memory_search hit or memory_timeline entry.",
                    properties: {
                        sessionKey: { type: "string" },
                        chunkId: { type: "string" },
                        turnId: { type: "string" },
                        seq: { type: "number" },
                    },
                    required: ["sessionKey", "chunkId", "turnId", "seq"],
                },
                maxChars: {
                    type: "number",
                    description: `Maximum characters to return (default ${types_1.DEFAULTS.getMaxCharsDefault}, max ${types_1.DEFAULTS.getMaxCharsMax}).`,
                },
            },
            required: ["ref"],
        },
        handler: async (input) => {
            const ref = input.ref;
            const maxChars = Math.min(input.maxChars ?? types_1.DEFAULTS.getMaxCharsDefault, types_1.DEFAULTS.getMaxCharsMax);
            const chunk = store.getChunksByRef(ref, resolveOwnerFilter(input.owner));
            if (!chunk) {
                return { error: `Chunk not found: ${ref.chunkId}` };
            }
            const content = chunk.content.length > maxChars
                ? chunk.content.slice(0, maxChars) + "…"
                : chunk.content;
            const result = {
                content,
                ref: {
                    sessionKey: chunk.sessionKey,
                    chunkId: chunk.id,
                    turnId: chunk.turnId,
                    seq: chunk.seq,
                },
                source: {
                    ts: chunk.createdAt,
                    role: chunk.role,
                    sessionKey: chunk.sessionKey,
                },
            };
            return result;
        },
    };
}
//# sourceMappingURL=memory-get.js.map
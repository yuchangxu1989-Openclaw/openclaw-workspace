import type { ChunkKind } from "../types";
export interface RawChunk {
    content: string;
    kind: ChunkKind;
}
/**
 * Semantic-aware chunking:
 * 1. Extract fenced code blocks as whole units (never split inside)
 * 2. Detect unfenced code regions by brace-matching (functions/classes kept intact)
 * 3. Extract error stacks, list blocks, command lines
 * 4. Split remaining prose at paragraph boundaries (double newline)
 * 5. Merge short adjacent chunks of the same kind
 */
export declare function chunkText(text: string): RawChunk[];
//# sourceMappingURL=chunker.d.ts.map
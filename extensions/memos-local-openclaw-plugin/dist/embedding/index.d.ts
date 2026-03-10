import type { EmbeddingConfig, Logger } from "../types";
export declare class Embedder {
    private cfg;
    private log;
    constructor(cfg: EmbeddingConfig | undefined, log: Logger);
    get provider(): string;
    get dimensions(): number;
    embed(texts: string[]): Promise<number[][]>;
    embedQuery(text: string): Promise<number[]>;
    private embedBatch;
}
//# sourceMappingURL=index.d.ts.map
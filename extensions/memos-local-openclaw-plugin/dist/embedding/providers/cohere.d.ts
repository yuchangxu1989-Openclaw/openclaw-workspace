import type { EmbeddingConfig, Logger } from "../../types";
export declare function embedCohere(texts: string[], cfg: EmbeddingConfig, log: Logger): Promise<number[][]>;
export declare function embedCohereQuery(text: string, cfg: EmbeddingConfig, log: Logger): Promise<number[]>;
//# sourceMappingURL=cohere.d.ts.map
import type { ConversationMessage, PluginContext } from "../types";
import type { SqliteStore } from "../storage/sqlite";
import type { Embedder } from "../embedding";
import { TaskProcessor } from "./task-processor";
export declare class IngestWorker {
    private store;
    private embedder;
    private ctx;
    private summarizer;
    private taskProcessor;
    private queue;
    private processing;
    private flushResolvers;
    constructor(store: SqliteStore, embedder: Embedder, ctx: PluginContext);
    getTaskProcessor(): TaskProcessor;
    enqueue(messages: ConversationMessage[]): void;
    /** Wait until all queued messages have been processed. */
    flush(): Promise<void>;
    private processQueue;
    private ingestMessage;
    private storeChunk;
}
//# sourceMappingURL=worker.d.ts.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Embedder = void 0;
const openai_1 = require("./providers/openai");
const gemini_1 = require("./providers/gemini");
const cohere_1 = require("./providers/cohere");
const voyage_1 = require("./providers/voyage");
const mistral_1 = require("./providers/mistral");
const local_1 = require("./local");
class Embedder {
    cfg;
    log;
    constructor(cfg, log) {
        this.cfg = cfg;
        this.log = log;
    }
    get provider() {
        return this.cfg?.provider ?? "local";
    }
    get dimensions() {
        if (this.provider === "local")
            return 384;
        return this.cfg?.dimensions ?? 1536;
    }
    async embed(texts) {
        const batchSize = this.cfg?.batchSize ?? 32;
        const results = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const vecs = await this.embedBatch(batch);
            results.push(...vecs);
        }
        return results;
    }
    async embedQuery(text) {
        if (this.provider === "cohere" && this.cfg) {
            return (0, cohere_1.embedCohereQuery)(text, this.cfg, this.log);
        }
        const vecs = await this.embedBatch([text]);
        return vecs[0];
    }
    async embedBatch(texts) {
        const provider = this.provider;
        const cfg = this.cfg;
        try {
            switch (provider) {
                case "openai":
                case "openai_compatible":
                    return await (0, openai_1.embedOpenAI)(texts, cfg, this.log);
                case "gemini":
                    return await (0, gemini_1.embedGemini)(texts, cfg, this.log);
                case "azure_openai":
                    return await (0, openai_1.embedOpenAI)(texts, cfg, this.log);
                case "cohere":
                    return await (0, cohere_1.embedCohere)(texts, cfg, this.log);
                case "mistral":
                    return await (0, mistral_1.embedMistral)(texts, cfg, this.log);
                case "voyage":
                    return await (0, voyage_1.embedVoyage)(texts, cfg, this.log);
                case "local":
                default:
                    return await (0, local_1.embedLocal)(texts, this.log);
            }
        }
        catch (err) {
            if (provider !== "local") {
                this.log.warn(`Embedding provider '${provider}' failed, falling back to local: ${err}`);
                return await (0, local_1.embedLocal)(texts, this.log);
            }
            throw err;
        }
    }
}
exports.Embedder = Embedder;
//# sourceMappingURL=index.js.map
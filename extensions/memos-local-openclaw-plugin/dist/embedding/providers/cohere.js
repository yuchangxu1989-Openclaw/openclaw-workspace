"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedCohere = embedCohere;
exports.embedCohereQuery = embedCohereQuery;
async function embedCohere(texts, cfg, log) {
    const endpoint = cfg.endpoint ?? "https://api.cohere.ai/v1/embed";
    const model = cfg.model ?? "embed-english-v3.0";
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
    };
    const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            texts,
            model,
            input_type: "search_document",
            truncate: "END",
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Cohere embedding failed (${resp.status}): ${body}`);
    }
    const json = (await resp.json());
    return json.embeddings;
}
async function embedCohereQuery(text, cfg, log) {
    const endpoint = cfg.endpoint ?? "https://api.cohere.ai/v1/embed";
    const model = cfg.model ?? "embed-english-v3.0";
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
    };
    const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            texts: [text],
            model,
            input_type: "search_query",
            truncate: "END",
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Cohere query embedding failed (${resp.status}): ${body}`);
    }
    const json = (await resp.json());
    return json.embeddings[0];
}
//# sourceMappingURL=cohere.js.map
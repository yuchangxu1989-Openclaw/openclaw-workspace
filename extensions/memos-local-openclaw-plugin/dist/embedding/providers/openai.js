"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedOpenAI = embedOpenAI;
async function embedOpenAI(texts, cfg, log) {
    const endpoint = normalizeEmbeddingEndpoint(cfg.endpoint ?? "https://api.openai.com/v1/embeddings");
    const model = cfg.model ?? "text-embedding-3-small";
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
    };
    const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: texts, model }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`OpenAI embedding failed (${resp.status}): ${body}`);
    }
    const json = (await resp.json());
    return json.data.map((d) => d.embedding);
}
/**
 * Normalize endpoint: if user provides a base_url (e.g. https://host/v1)
 * without the /embeddings suffix, append it automatically.
 */
function normalizeEmbeddingEndpoint(url) {
    const stripped = url.replace(/\/+$/, "");
    if (stripped.endsWith("/embeddings"))
        return stripped;
    return `${stripped}/embeddings`;
}
//# sourceMappingURL=openai.js.map
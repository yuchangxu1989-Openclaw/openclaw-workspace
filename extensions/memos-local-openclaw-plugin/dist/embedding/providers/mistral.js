"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedMistral = embedMistral;
async function embedMistral(texts, cfg, log) {
    const endpoint = cfg.endpoint ?? "https://api.mistral.ai/v1/embeddings";
    const model = cfg.model ?? "mistral-embed";
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
    };
    const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: texts, model, encoding_format: "float" }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Mistral embedding failed (${resp.status}): ${body}`);
    }
    const json = (await resp.json());
    return json.data.map((d) => d.embedding);
}
//# sourceMappingURL=mistral.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedVoyage = embedVoyage;
async function embedVoyage(texts, cfg, log) {
    const endpoint = cfg.endpoint ?? "https://api.voyageai.com/v1/embeddings";
    const model = cfg.model ?? "voyage-2";
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
        throw new Error(`Voyage embedding failed (${resp.status}): ${body}`);
    }
    const json = (await resp.json());
    return json.data.map((d) => d.embedding);
}
//# sourceMappingURL=voyage.js.map
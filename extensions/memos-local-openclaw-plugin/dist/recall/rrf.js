"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rrfFuse = rrfFuse;
function rrfFuse(lists, k = 60) {
    const scores = new Map();
    for (const list of lists) {
        for (let rank = 0; rank < list.length; rank++) {
            const item = list[rank];
            const prev = scores.get(item.id) ?? 0;
            scores.set(item.id, prev + 1 / (k + rank + 1));
        }
    }
    return scores;
}
//# sourceMappingURL=rrf.js.map
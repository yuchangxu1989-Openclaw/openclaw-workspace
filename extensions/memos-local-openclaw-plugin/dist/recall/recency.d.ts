/**
 * Time decay scoring (PRD §5.3)
 *
 * Applies exponential decay based on document age, biasing towards
 * more recent memories. Uses configurable half-life (default 14 days).
 *
 * decay(t) = 0.5 ^ (age_days / half_life)
 * final = base_score * (alpha + (1-alpha) * decay)
 *
 * alpha=0.3 ensures old but highly relevant results are not zeroed out.
 */
export declare function applyRecencyDecay(candidates: Array<{
    id: string;
    score: number;
    createdAt: number;
}>, halfLifeDays?: number, now?: number): Array<{
    id: string;
    score: number;
}>;
//# sourceMappingURL=recency.d.ts.map
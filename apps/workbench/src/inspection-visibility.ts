/** A source part must block more than a grazing ray before it enters the view. */
export const INSPECTION_VISIBILITY_POLICY = {
  cameraQuietMs: 180,
  sampleIntervalMs: 120,
  enterMs: 160,
  exitMs: 420,
} as const;

export interface ObstructionCandidate { translucent: boolean; since: number }
export interface StableObstructions {
  translucentPartIds: Set<string>;
  candidates: Map<string, ObstructionCandidate>;
}

export function stableObstructions(state: StableObstructions, hits: ReadonlyMap<string, number>, sampleCount: number, now: number) {
  const enterHits = Math.min(2, Math.max(1, sampleCount));
  const next = new Set(state.translucentPartIds);
  let changed = false;
  for (const id of new Set([...hits.keys(), ...next, ...state.candidates.keys()])) {
    const translucent = next.has(id);
    // An existing transparent part stays transparent with one obstructed
    // sample. Leaving requires zero hits for longer than entering requires.
    const desired = (hits.get(id) || 0) >= (translucent ? 1 : enterHits);
    if (desired === translucent) { state.candidates.delete(id); continue; }
    let candidate = state.candidates.get(id);
    if (candidate?.translucent !== desired) {
      candidate = { translucent: desired, since: now };
      state.candidates.set(id, candidate);
    }
    if (now - candidate.since < (desired ? INSPECTION_VISIBILITY_POLICY.enterMs : INSPECTION_VISIBILITY_POLICY.exitMs)) continue;
    if (desired) next.add(id); else next.delete(id);
    state.candidates.delete(id);
    changed = true;
  }
  return { translucentPartIds: next, changed, pending: state.candidates.size > 0 };
}

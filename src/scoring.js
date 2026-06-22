// Scoring: dot-product of a stat block against a weight scale.
// The optimizer ranks legal sets by this once the hard caps are satisfied.

import { SCALES } from './weights.js';

// score(stats, weights) = sum(stats[k] * weights[k]) over shared keys.
export function score(stats, weights) {
  let total = 0;
  for (const key of Object.keys(weights)) {
    const v = stats[key];
    if (typeof v === 'number') total += v * weights[key];
  }
  return total;
}

// Convenience: score a stat block by named scale.
export function scoreByScale(stats, scaleName) {
  const w = SCALES[scaleName];
  if (!w) throw new Error(`Unknown scale: ${scaleName}`);
  return score(stats, w);
}

// Per-stat contribution breakdown (for the "why this piece" UI later).
export function contributions(stats, weights) {
  const out = {};
  for (const key of Object.keys(weights)) {
    const v = stats[key];
    if (typeof v === 'number' && v !== 0 && weights[key] !== 0) {
      out[key] = v * weights[key];
    }
  }
  return out;
}

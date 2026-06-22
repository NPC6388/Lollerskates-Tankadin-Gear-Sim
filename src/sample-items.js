// Illustrative sample item pool for demoing the optimizer end-to-end.
// NOT a real item database — stats are representative, not exact. Each armor slot
// offers a Threat variant (high spell power, light avoidance) and a Tank variant
// (high defense/avoidance, low spell power), so the threat objective must trade a
// few slots to stay crit-immune and uncrushable. Replaced by the real DB + addon import later.

const T = (id, slot, spellDamage, stamina, defenseRating, armor) =>
  ({ id, name: `${slot} (threat)`, slot, stats: { spellDamage, stamina, defenseRating, armor } });

const A = (id, slot, defenseRating, dodgeRating, parryRating, blockRating, stamina, blockValue, armor) =>
  ({ id, name: `${slot} (tank)`, slot, stats: { defenseRating, dodgeRating, parryRating, blockRating, stamina, blockValue, spellDamage: 8, armor } });

export const SAMPLE_POOL = {
  head:      [T(1, 'head', 34, 24, 26, 700),       A(2, 'head', 48, 22, 14, 40, 32, 12, 950)],
  shoulders: [T(3, 'shoulders', 26, 18, 22, 550),  A(4, 'shoulders', 40, 18, 12, 36, 28, 10, 760)],
  chest:     [T(5, 'chest', 34, 24, 26, 800),       A(6, 'chest', 48, 24, 14, 42, 32, 14, 1050)],
  hands:     [T(7, 'hands', 24, 18, 22, 560),        A(8, 'hands', 40, 18, 12, 38, 27, 10, 780)],
  legs:      [T(9, 'legs', 34, 26, 28, 820),         A(10, 'legs', 50, 24, 14, 44, 34, 14, 1080)],
  feet:      [T(11, 'feet', 24, 18, 24, 600),        A(12, 'feet', 40, 20, 12, 36, 27, 10, 820)],
  waist:     [T(13, 'waist', 24, 18, 22, 520),       A(14, 'waist', 40, 18, 12, 38, 27, 10, 720)],
  wrists:    [T(15, 'wrists', 20, 14, 18, 420),      A(16, 'wrists', 34, 16, 10, 32, 22, 8, 600)],
  weapon:    [{ id: 17, name: 'weapon (threat)', slot: 'weapon', stats: { spellDamage: 44, hitRating: 10, stamina: 15 } },
              { id: 18, name: 'weapon (tank)', slot: 'weapon', stats: { spellDamage: 10, stamina: 35, defenseRating: 26 } }],
  shield:    [{ id: 19, name: 'shield (threat)', slot: 'shield', stats: { spellDamage: 26, blockValue: 30, stamina: 24, armor: 2400, defenseRating: 18 } },
              { id: 20, name: 'shield (tank)', slot: 'shield', stats: { blockRating: 45, blockValue: 45, defenseRating: 30, stamina: 34, armor: 3000 } }],
};

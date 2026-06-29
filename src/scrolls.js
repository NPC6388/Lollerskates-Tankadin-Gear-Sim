// Consumable scrolls the player can run to provide flat stats — letting the gem/enchant/item budget
// shift toward threat while the scroll covers some avoidance/defense. TBC rank-V values (the scrolls
// stack with Kings/MotW and each other). Primary-stat scrolls feed `buffs` (so Kings' +10% applies,
// exactly as in-game); Scroll of Protection's armor feeds `flatArmor` so Toughness — which only
// boosts armor FROM ITEMS — does NOT inflate it.
export const SCROLLS = {
  agility: { name: 'Scroll of Agility V', stat: 'agility', value: 20 },     // -> dodge
  strength: { name: 'Scroll of Strength V', stat: 'strength', value: 20 },  // -> block value
  intellect: { name: 'Scroll of Intellect V', stat: 'intellect', value: 20 }, // -> spell crit/mana
  protection: { name: 'Scroll of Protection V', stat: 'armor', value: 301, flat: true }, // +301 armor
};

// Sum a list of scroll keys into { buffs: {primary stats}, flatArmor }. Unknown keys are ignored.
export function scrollStats(keys = []) {
  const buffs = {};
  let flatArmor = 0;
  for (const key of keys) {
    const s = SCROLLS[key];
    if (!s) continue;
    if (s.flat) flatArmor += s.value;
    else buffs[s.stat] = (buffs[s.stat] || 0) + s.value;
  }
  return { buffs, flatArmor };
}

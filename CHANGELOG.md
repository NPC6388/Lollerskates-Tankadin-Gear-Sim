# Changelog

Notable changes to the sim engine and the companion addon. Newest at the bottom.

## Engine milestones
- **M1 — core math & constraint engine.** `constants.js`, `threat.js`, `combat.js`,
  `weights.js`, `scoring.js`. Reproduces the guide's reference-profile numbers (threat
  formulas, 67.79% avoidance, the 490 crit-immunity gate, 102.4 crush threshold, 244/365
  resistance targets).
- **M2 core — optimizer & objectives.** `character.js` (set evaluator with spreadsheet
  parity), `model.js`, `optimizer.js` (exhaustive + greedy/repair heuristic),
  `sample-items.js`. Threat objective = Spell Power; survival = EHP; uncrittable always +
  uncrushable per goal as hard gates.
- **M3 (in progress) — gem/enchant solver + professions.** `professions.js` (TBC-accurate
  perks: BS sockets, JC gems, Enchanting ring enchants, LW bracer), `gems.js` + `enchants.js`
  (curated tank seed DBs scored by the weight scales), `gemsolver.js` (weight-driven gem +
  enchant recommendations, profession-gated; ring enchants count for both rings). The
  buff toggle landed earlier as `aggregate()`'s `buffs` block. Remaining: the bundled full
  item DB for manual search, and socket-bonus-worth-it matching (needs the addon to export
  per-item socket-bonus values).
- **M4 — companion export addon.** `/tgs` exports equipped + bags + bank as `I:`/`E:`
  lines plus a `C:` character-sheet line.

## Companion addon (TankadinGearSim)
- **v4** — scan item *tooltips* so stats include gems + enchants (GetItemStats returns
  base/empty-sockets only); skip on-use/proc lines; tag equipped items as `E:`.
- **v5** — capture the in-game "Spell Damage" wording (not just "spell power"); split
  combined stat lines on " and "/comma so both stats are read (Glyph of Power, Runic
  Spellthread, shoulder inscriptions); un-anchor primary-stat matching so socketed-gem
  stamina/intellect count. Fixed a ~21% spell-power undercount.
- **v6** — read a shield's base "N Block" line into block value; export strength +
  intellect on the `C:` line.
- **v7** — skip *inactive* (grey) socket bonuses via tooltip line color, so bonuses the
  player's gems don't satisfy are no longer counted (fixed a +4 phantom defense rating and
  hidden phantom stamina).

## Model
- **De-calibration.** Removed the old `calibrate()` back-fit (it masked capture bugs).
  `model.js` now does a first-principles forward calc: L70 Blood Elf Paladin race/class
  bases + the guide's Avenger's Shield build (0/43/18) talents + gear, from documented
  constants. Reproduces the unbuffed character sheet to rounding (dodge/parry exact,
  defenseSkill +0.06, block +0.01). `aggregate()` takes an optional `buffs` block for the
  raid-buffed view. Block value carries an expected ±1 vs the sheet (a WoW-side rounding
  quirk in the Strength/20 term, confirmed on the live sheet).
- **Set bonuses.** `sets.js` detects tier sets by item ID and reports the combat
  modifiers: Justicar (T4) 2pc +10% seal / 4pc +15 Holy Shield; Crystalforge (T5) 2pc +15
  Retribution Aura (wired into `threat.js`) / 4pc +100 block value.

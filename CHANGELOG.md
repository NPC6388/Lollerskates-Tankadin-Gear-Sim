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
  - **Gem/enchant DBs validated** against in-game tooltips (`GEM_ENCHANT_REVIEW.md`). Rebuilt
    `gems.js` as a lean Pareto pool with corrected stats (rare gems are +8 not +10; fixed
    Sovereign Nightseye to +4 Str; dropped Brutal Earthstorm Diamond — it's +3 *melee*, not
    spell, damage), added a `phase` field + `CURRENT_PHASE` gate so later-content gems
    (Seaspray Emerald p3, Charmed Amani Jewel/ZA) are recorded but not recommended, and added
    the threat gems (Potent Noble Topaz/Fire Opal, Imbued Unstable Diamond meta). Per the
    guide's weights, stats with no scale entry (attack power, spell crit, meta crit-damage)
    are noted but not scored. `enchants.js`: removed Boots-Dodge/Boar's-Speed and
    Weapon-Savagery; added Boots-Dexterity/Fortitude, Bracer/Gloves Spellpower, Shield-Block,
    Cloak-Dodge, and the spell-power shoulder inscriptions; corrected Greater Inscription of
    Warding to +15 Dodge/+10 Def.
  - **Socket-bonus-worth-it landed (needs addon v8).** `gemsolver.js` now plans gems *per
    item*: for each socketed piece it compares filling every socket with the globally best
    gem (ignore color, forfeit the bonus) against matching each socket's color to activate
    the bonus and adding it, keeping whichever scores higher by the goal's weights. This
    confirmed the old "tank gemming is all-stamina, ignore bonuses" shortcut is wrong under
    the real weights — for avoidance-leaning survival gear, a stamina+avoidance hybrid plus
    the socket bonus often beats a pure-stamina gem; for threat gear the raw spell-damage gem
    usually wins. `import.js` exposes `item.baseStats`, `item.sockets` (full color layout),
    and `item.socketBonus`; gem stats are added relative to `baseStats` (not the resolved,
    already-gemmed stats) so a recommended re-gem doesn't double-count.
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
- **v8** — each item line gains two fields after the resolved stats: **base** stats from
  `GetItemStats` on the gem/enchant-stripped base link (clean item + the full socket-color
  layout, every socket even when filled) and the discrete **socket bonus**
  (`ITEM_MOD_*:val`, captured active or grey). Closes the socket-bonus export gap so the gem
  solver can do per-item worth-it matching and recommend re-gems from a clean base.
- **v9** — append the item's display **name** (from `GetItemInfo`) as a trailing field, so
  optimization/readout can show real names instead of item IDs for owned gear (no name DB to
  source or maintain — the client is the source of truth). `import.js` exposes `item.name`.

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

## Threat-set tuning (2026-06)
- **Buffs: Kings + MotW stack.** Corrected the model — Blessing of Kings (+10% primaries) and
  Mark of the Wild (flat +14) are different sources and DO stack (flat applied first, then ×1.10).
  `runner.js` gains a `raid` buff mode applying both; it's the default for buffed runs (CLI + UI).
  Previously they were treated as mutually exclusive ("the larger wins").
- **Spell crit is now scored.** `spellCritRating` added to `STAT_KEYS`, the weight template, the
  threat blends (`PARTS.threat` 0.3 / `aoeThreat` 0.4) and named threat `SCALES` (0.45–0.7) +
  `balanced` (0.3), calibrated from a spell crit's +0.5× damage. `aggregate()` surfaces it and the
  CLI prints it. The crit on the Potent gems and the two shoulder inscriptions is now folded into
  their scored stats (was noted-but-unscored).
- **Gem DB.** Added `Veiled Noble Topaz` (5 spell dmg / 4 spell hit — the single-target threat
  hybrid that now beats a pure +9 damage gem under the ST weights) and `Runed Ornate Ruby`
  (+12 spell dmg, **unique**). `bestGem` skips `unique` gems for bulk socket fill, so the workhorse
  stays Runed Living Ruby and the optimizer never recommends multiples of a one-per-character gem.
- **Net effect:** the optimizer's single-target Raid Threat set now independently reproduces a
  hand-built Veiled-gemmed, high-hit, crit-carrying build instead of shedding hit for raw spell
  power. Remaining: a spell-hit **soft cap** (hit is still valued past the 17% cap in the blended
  goals), Scryer/Aldor faction handling, and per-socket gemming. See `SESSION_LOG.md`.

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
- **Import: name parsing made format-robust.** The optional `socketBonus` field is omitted by some
  addon builds (`…|base|name`) rather than left empty (`…|base||name`); the fixed-index parse then
  shoved the name into the bonus slot and dropped it — so every trinket (no socket bonus) lost its
  name and the lock dropdown showed item IDs. `import.js` now resolves the trailing fields by SHAPE
  (a socket-bonus token is `ITEM_MOD_*:<num>`; anything else is the name), handling both formats.
- **Model reconciliation** against the player's live sheet + Sixty Upgrades buffed export confirms
  the engine end to end: spell hit (8.63%) and spell crit (38 rtg) match to the digit; SP/str/agi/
  int exact; stamina within the known ±rounding.
- **Meta gems: compound requirements + corrected metas.** The threat set was recommending a meta
  that can't activate (e.g. a dead Relentless on the helm). Corrected the activation requirements
  the old single-clause parser couldn't express: **Eternal** = `2+ blue, 1+ yellow`, **Relentless**
  = `2+ red, 2+ yellow, 2+ blue`; `metaActivated` now evaluates comma-separated AND clauses, so the
  solver never recommends a meta the set can't turn on. The current-phase threat meta is **Imbued
  Unstable Diamond** ("more red than blue" — met by an all-red/orange threat set). Added **Ember
  Skyfire Diamond** (+14 spell dmg, 3+ red) for completeness but gated to **phase 5** (this realm's
  timeline), so the phase gate keeps it out of recommendations until then.
- **Reclaim the gate overshoot (def-gem waste).** The optimizer selects cap (def-gem) item variants
  from APPROXIMATE raw-gem stats during the search, but the socket-bonus-aware FINAL set often
  clears the gates without them — leaving a def-gemmed piece (e.g. a def neck on a max-threat set)
  and the set several % over the uncrush cap. `runGoal` now runs a reclaim pass on the TRUE final
  stats: it flips def-gemmed pieces back to threat gems greedily, keeping any flip that leaves the
  set legal (uncrit + uncrush + min-HP). On a max-threat set this dropped uncrush 105.2% → 102.7%
  and recovered ~27 SP, while the genuinely load-bearing def-gem stays put.
- **Min-HP gate (per set).** Each goal gets a hard raid-buffed-HP floor, enforced exactly like
  uncrit/uncrush — applies to all four sets incl. AOE Trash. `optimizer.js` `gatesPass`/`gateDeficit`
  take `gates.minHealth` (the HP shortfall is normalised ÷1000 so the repair heuristic balances it
  against the %-unit crit/crush deficits); `character.js` `evaluateSet` now surfaces raw `health`.
  The web UI adds a **Min HP** slider per set (10k–14k, 500 steps; 10k default ≈ off) and a gate
  chip showing `HP / floor`. When the floor is unreachable the set is reported illegal, never
  silently violated.
- **Neck gem** (Pendant of Dominance, yellow socket + spell-crit socket bonus) now correctly takes
  Veiled Noble Topaz and earns its bonus — fixed by the Veiled gem addition above.
- **Epic gems are unique on this realm.** Every epic cut (Fire Opal / Tanzanite / Chrysoprase /
  Seaspray / Amani) is one-per-character, so `bestGem` now excludes `epic` gems (and explicit
  `unique` ones like Runed Ornate Ruby) from bulk socketing — the sim never recommends an
  impossible count. The bulk pick falls back to the near-identical **rare** cut (Glowing Tanzanite →
  Glowing Nightseye, Enduring Chrysoprase → Enduring Talasite, Regal Tanzanite → Regal Nightseye,
  Stalwart Fire Opal → Thick Dawnstone), a ~1-stat-point difference: all four sets moved <1%
  (≤10 SP / ≤200 EHP) and stayed legal. An `allowUnique` opt-in is the hook for future
  single-placement (slot one epic in its best socket).
- **Meta-recolor preserves socket bonuses.** When a color-gated meta (e.g. Powerful, 3+ blue — the
  fallback when the Imbued threat meta is toggled off) needed a socket recolored, the recolor picked
  the highest-scoring gem of the needed color without regard for socket bonuses, so a yellow socket
  turning blue got a *purple* gem and **forfeited its bonus** (e.g. the helm's +4 dodge). `bestGem`
  gains an `alsoFits` filter; the recolor now prefers a **dual-color** gem that supplies the meta
  color AND fits the socket's own color (yellow socket → *green*, keeping the +4 dodge), and only
  falls back to a bonus-breaking gem when no dual cut exists — recovering the avoidance that was
  silently lost (and can tip a borderline set back to uncrushable).
- **Enchants are phase-gated** (they weren't before). `bestEnchant` skips any enchant above
  `opts.maxPhase` (default CURRENT_PHASE), threaded through the runner + `recommendEnchants`.
  **Enchant Cloak - Steelweave** is marked **phase 5**, so the survival/def sets no longer
  recommend it now (they fall back to Cloak - Dodge); it returns once the realm reaches phase 5.
- **Agility valued a touch above dodge rating** in the EHP-value weights (`PARTS.ehp`, `survivalEHP`,
  `balanced`). Per point, agility gives less dodge than dodge rating, but it ALSO adds armor (2/agi)
  + melee crit and scales with Kings (×1.1), where flat dodge rating doesn't — so its total tank
  value edges ahead. Effect: the cloak enchant now picks **Greater Agility** over **Cloak - Dodge**
  (relevant once Steelweave is phase-gated out). The **uncrushable-cap** scale is left dodge-ahead
  on purpose — reaching the crush cap is about raw avoidance per point, where dodge rating wins.
- **Gate-aware socket bonuses.** The per-item socket-bonus worth-it test (`planItemGems`, option A
  vs B) scored only on the goal weights, so on a threat-leaning set (e.g. 1:4) a focus piece would
  **forfeit a gate-stat bonus** — most importantly a chest's **+4 defense** — because matching the
  off-color (blue) socket costs more *threat* than the bonus is worth on that scale. But defense is
  avoidance: that bonus is load-bearing for the **uncrushable** gate, and the threat objective prices
  it at ~0. `planItemGems` gains a `gateScale` opt and a `GATE_STATS` set (defense/dodge/parry/block/
  resilience/agility); the runner re-gems **gate-aware** (the worth-it test priced on the cap scale)
  whenever the socket-bonus-aware set **misses a hard gate** (crush / crit / min-HP), so focus pieces
  reclaim those bonuses — the cheapest stats back toward the gate — and the flag stays on through the
  reclaim pass so it can't be undone. A bonus that *isn't* gate-relevant is left alone unless taking
  it is free (next entry); stamina bonuses aren't gate stats, so a shoulder's +4 stam stays
  threat-optimal.
- **Free socket bonuses are no longer dropped on a tie.** The worth-it test took the bonus only on a
  strict win (`>`), so when the gems you'd slot anyway already match the sockets — matching costs
  nothing — a bonus whose stat is worth ~0 on the goal scale was forfeited rather than banked. Now
  `>=`: a tie goes to the matching option, so any **free** socket bonus is kept.
- **"Keep existing gems/enchants" build mode.** New `optimizeSets` option `keepGemsEnchants`
  (`true` = every item — budget mode; an item-id array or `{ itemIds, slots }` = lock specific
  shared pieces). A **locked** item is used exactly as it sits: scored on its resolved stats, never
  re-gemmed or re-enchanted, with its CURRENT gems + enchant reported (ids → names via the curated
  DBs). Mechanically it's a single variant (no focus/cap split) contributing `resolved − base` on
  top of `baseStats`, so there's no double-count; the per-slot readout gains a `locked` flag (web
  paper-doll shows a **kept** tag, CLI shows **[kept]**, exports the kept gem/enchant ids). Motivation:
  budget players who can't re-cut gems / buy enchants per set, and items physically **shared across
  sets** that can't be re-gemmed on every swap. CLI: `KEEP_GEMS=1 node bin/optimize.mjs`; web: the
  "Keep current gems & enchants" checkbox.
  - **Only COMPLETE items lock.** `lockEligible` gates locking: an item with an **empty socket** (gem
    count < socket count) or a **missing enchant** (one the solver would otherwise apply, given the
    player's perks/phase/faction) is never locked — there's nothing finished to preserve, so the
    solver gems/enchants it normally. This makes "keep all" mean *keep what you've finished, optimize
    the rest*, which is the useful budget default without per-item toggling.
  - **Scope presets** instead of a 40-item checklist. `keepGemsEnchants` now also takes
    `{ equippedOnly?, ignoreCompleteness? }`, surfaced in the web UI as a dropdown:
    **Re-gem everything** (off) / **Keep all completed** (`true`) / **Keep equipped completed**
    (`{equippedOnly:true}`) / **Keep current set as-is** (`{equippedOnly:true, ignoreCompleteness:true}`
    — freezes worn items even when unfinished). CLI mirrors via `KEEP_GEMS=all|equipped|current`.
    Caveat: "as-is" freezes worn gems/enchants but the optimizer may still swap a slot to a strictly
    better item (which then gets gemmed) — a true no-swap "evaluate my exact set" mode is a follow-up.
- **Per-gem socket-color in the readout (socket bonus actually activates).** The solver already
  assigned the right gem to each socket color (e.g. shoulder: Veiled→yellow, Glowing Nightseye→blue)
  and credited the bonus, but the per-slot output dropped the socket color — so when placed in-game
  the gems landed in the wrong sockets (Justicar's sockets are physically blue-then-yellow) and the
  bonus greyed out. The export's socket order is unreliable (Lua `pairs()` — base seg lists BLUE,YELLOW
  while resolved lists YELLOW,BLUE), so placement must be COLOR-based: `perSlot.gems[*]` now carries
  its `socket` color and the web paper-doll shows a colored socket dot per gem. Place each gem in the
  matching-color socket and the bonus lights up regardless of physical order.
- **Per-socket gem layout + manual-socketing note.** The paper-doll now shows each recommended gem in
  its own cell — the **socket color** chip on top, the **gem that goes in it** directly beneath — and
  each set card carries a reminder that gems can't be applied automatically and must be socketed by
  COLOR (not order, which varies in-game) or the bonus won't activate. Replaces the bare color dot.
- **Socket bonus: clear active vs deliberately-skipped state.** Each socketed piece now reports
  `bonusKept` — computed from the FINAL gems (every colored gem fits its tagged socket, so it survives
  meta recolors). The paper-doll shows **✓ Socket bonus active: +N Stat** (with the socket-color chips,
  since placement matters) when earned, and **✕ Socket bonus skipped: +N Stat — not worth an off-color
  gem** when the solver forfeits it on purpose (chips hidden, since the gem can go in any socket). The
  manual-socketing note only stresses color-matching when a bonus is actually being earned.
- **Sixty Upgrades stat weights on the page + how-to.** New "Sixty Upgrades stat weights" panel
  renders the guide's named weight scales (single-target threat below/at caps, AOE, survival
  uncrushable/EHP, balanced) as readable tables, each with a **Copy Pawn string** button for import
  into Sixty Upgrades / any Pawn-compatible planner, plus a how-to (custom weights, Pawn import vs
  manual entry, and the reminder that the uncrit/uncrush gates aren't enforced by weights).
- **Lock conditions: leg armor / spellthread confirmed counted.** Leg armor (Runic Spellthread 2748,
  Nethercleft 3013) and every slot enchant (weapon/ring/etc.) are applied via the item's enchant id,
  which `lockEligible` already checks — a leg without leg armor is treated incomplete (solver adds it),
  one with it can lock. Added a regression test. (Open gap: the **Eternal Belt Buckle** waist socket
  isn't modeled — we don't suggest it or flag its absence; tracked for a future socket-enhancement pass.)

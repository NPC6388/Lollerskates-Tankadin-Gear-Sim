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
  one with it can lock. Added a regression test. (TBC belts take **no** slot enhancement — the Eternal
  Belt Buckle is a WotLK addition — so the waist correctly has none; all TBC enhancement types are covered.)
- **Import no longer drops stat-less equip-slot items.** `equippableItems` previously required at
  least one parsed stat, silently hiding owned gear whose value is a non-stat effect — a
  Consecration/threat **libram**, a pure on-use **trinket**. Now it keeps anything with a recognized
  equip slot (scored on whatever stats it has, 0 if none) so the piece is at least selectable and its
  slot fillable; non-gear (shirts/tabards/quest items) still has no equip slot and stays excluded.
  (Note: a libram still needs its threat effect MODELED to be auto-preferred — being in the pool only
  makes it available, not better. And bank gear is only captured when the bank window is OPEN during /tgs.)
- **Libram effect modeling + AOE goal now uses AOE-threat weighting.** Librams score through a special
  equip effect the tooltip parser can't read as a stat, so `src/librams.js` models known Prot librams
  as effective stats (overriding parsed stats, no double-count): **Libram of the Eternal Rest** →
  `consecrationDamage: 47`, **Libram of Repentance** → `blockRating: 42`. New modeled stat
  `consecrationDamage` (a flat add to Consecration; NOT spell power, so spell-power reconciliation is
  untouched) is scored by the threat scales — modest single-target (~0.4/SP-pt: Consecration is one of
  several holy threat sources), **high for AOE** (~2× SP: Consecration hits every target). The **AOE
  Trash** goal now blends `aoeThreat` (was the single-target `threat` part — it only differed from the
  raid set by a looser crush gate), so it actually optimizes AOE threat. Net result: the AOE set picks
  **Libram of the Eternal Rest**, while raid/survival/balanced keep **Libram of Repentance** — matching
  the mechanic that Holy Shield (and thus Repentance's conditional block bonus) stays up single-target
  but is consumed early in AOE, where the unconditional Consecration libram wins.
- **Libram modeling reworked to use only real (Sixty Upgrades) stats.** Dropped the `consecrationDamage`
  pseudo-stat — it has no home in the SU scales, so weighting it there was invalid. Instead a libram's
  flat-damage effect is converted to **equivalent spell damage** (the same stat the scales/SU use):
  Libram of the Eternal Rest's +47 Consecration damage → ~35 effective spell damage (raw coefficient
  inversion is ~49, discounted because the effect feeds only Consecration, not the whole rotation).
  The AOE scale weights spell damage higher (Consecration scales per target), so the threat-model
  optimizer lands on the right split on the real scan: **AOE → Libram of the Eternal Rest;
  raid/survival/balanced → Libram of Repentance** (its block→Holy-Shield threat holds up single-target).
  Limitation noted in `librams.js`: a single spell-damage number can't make it AOE-*only*; tune there.
- **Socket note reworded for the Sixty Upgrades flow.** The gems ARE in the export, but socket order
  isn't always exported correctly, so the note now says you may need to **swap the gems between sockets**
  in Sixty Upgrades (match each to its socket color) so the bonus activates — instead of implying you
  socket them from scratch.
- **Import self-heals dropped innate stats (tooltip-scan capture gap).** The addon's tooltip scan
  (resolved field) was missing "+spell damage" equip lines on some plate — "Increases damage and
  healing done by magical spells and effects by up to N" — while `GetItemStats` (base field) captured
  it. Affected ≥4 items in a real scan (Girdle of Valorous Deeds sp19, Crusader's Ornamented Spaulders
  sp7, The Seal of Danzalar sp24, Veteran's Lamellar Bracers sp21). Since resolved should always be
  ≥ base for innate stats (it's base + gems + enchants), `import.js` now lifts any stat the scan came
  up short on to the base value. This fixes keep-mode deltas (which went negative) and the as-worn
  evaluation; the optimizer was already unaffected (it scores from the base field). Re-scanning with
  the current addon also fills resolved at the source.
- **AOE Trash: dropped the crushing-blow gate + de-valued spell hit.** Level ≤72 trash can't land
  crushing blows (only 73+ bosses do), so the AOE Trash goal no longer requires uncrushable — that
  itemization goes to threat instead (crit immunity is still required; trash can crit). And because a
  level-72 mob needs only ~5% spell hit (vs ~16% for a raid boss) — easily reached — `spellHitRating`
  is weighted low in the AOE-threat scale: `PARTS.aoeThreat` 1.3 → 0.3 and the SU/Pawn `threatAOE`
  scale 2.2 → 0.5. Net at 1:4: the AOE set stops holding shield-block / avoidance pieces (Aldori,
  Seventh Ring, Crimson belt) for a crush cap it doesn't need and takes pure-threat gear (Merciless
  Gladiator's Barrier, Veteran's Lamellar Belt, Seer's Signet, …), ~+40 SP. The gate readout shows
  "Uncrushable N% — not required (trash)" for this set (web + CLI).
- **Socket-color chip shown for every recommended gem** (not only when the bonus is active) — each gem
  now displays its socket-color label above it (locked/as-worn items still just list their gems). The
  gem export note reworded to: "Verify gems are in the correct sockets on Sixty Upgrades — the export
  sometimes puts them in the wrong holes."
- **Weights copy button now emits Sixty Upgrades JSON (was a Pawn string).** SU's custom stat-weights
  format is a flat JSON of `{ ourKey: weight }` using the same stat keys this sim uses (including the
  meta/red/yellow/blue socket weights, and even `blockValueBonus`), omitting zeros — confirmed against
  the player's working single-target AND survival scales. Each scale's button now copies
  `JSON.stringify` of its non-zero entries. How-to updated (copy JSON → paste into SU Custom Stat
  Weights); the Pawn string is gone.
- **Verified Sixty Upgrades accepts every emitted weight key**, including `spellCritRating` (player
  pasted the updated Single-Target/AOE JSON into SU with no error and `spellCritRating` is listed). So
  the SU weights export needs no key filtering — the full non-zero scale (incl. `blockValueBonus` and
  the socket weights) imports cleanly.
- **Meta activation accounts for locked items (and flags a kept dark meta).** `resolveMetas` now
  tallies LOCKED items' current gem colors toward meta activation (a kept blue-gemmed piece helps a
  "3+ blue" meta), and when the meta socket itself is on a locked item it reports whether that kept
  meta is active given the whole set's colors — so a dark meta (e.g. a locked head's "3+ blue" Powerful
  with only 2 blue) is now flagged in the readout instead of silently shipped.
- **"Lock this set's gems/enchants" button per set.** Each displayed set has a button that adds its
  items to a persistent locked list (shown as a banner of chips with unlock ×, plus Clear all); the
  set re-optimizes so every other set keeps those gems/enchants — so committing one set won't get
  undone when you tune the next. `keepConfig` filters are now OR-combined, so this item-id lock stacks
  with the scope dropdown.
- **Buff note is a live per-set calculation.** Kings is +10% of base stats, so its share depends on
  the set — the note now shows each buffed stat with its downstream effect computed live: stamina
  (≈health), agility (≈% dodge), intellect (≈% spell crit), armor (≈% damage reduction), e.g.
  "+25.1 agility (≈+1.00% dodge)".
- **"How the sim works" explainer — rendered from the LIVE constants.** A collapsed box after the
  stat-weight scales documents the full engine logic top to bottom: the first-principles character model
  (base + talents + gear + Kings/MotW), the hard gates (uncrittable / uncrushable / min-HP), EHP (armor +
  Imp RF, why avoidance isn't multiplied in, full-avoidance-over-block beyond the cap), the spell-power
  threat model + scored set bonuses, the four sliders, gemming/meta/enchant logic, and the overrides.
  Every number (102.4% crush cap, ×1.9 RF, 11960 armor const, set-bonus SP-equivalents, the ~4.4×
  avoidance-vs-block ratio, −6% Imp RF, all rating conversions, …) is **interpolated at render time from
  the same modules the optimizer uses** (`constants.js` / `weights.js` / `sets.js` / `model.js`), so it
  can't drift when a constant is tuned. `app.js` `renderLogic()`; `index.html` (`#logicBody`) + `style.css`.
  The box's "TBC Prot Paladin guide" reference links to the companion guide
  (https://npc6388.github.io/wow-tbc-prot-paladin-guide/) via a single `GUIDE_URL` constant.
- **The optimizer now scores tier set bonuses (was blind to them).** Previously `setBonuses` was
  computed for display but no objective used it, so a leg/shoulder swap that completed or broke a 2pc/4pc
  was invisible to selection. Each bonus is now modeled as an equivalent flat-stat bundle (like the
  libram effects) and added to the `scale` objective, scored by the goal weights — so it's a real win on
  a threat set and ~nothing on a survival set. Threat bonuses are spell-power-equivalents derived from
  the threat model at ~800 SP: Justicar 2pc (+10% seal ≈ +19 TPS) → 20 SP, Justicar 4pc (+15/HS block
  ≈ +13 TPS) → 15, Crystalforge 2pc (+15 Ret Aura/hit, situational) → 12; Crystalforge 4pc (+100 block
  value 6s post-HS) → block value. The bonus only "wins" if it beats the alternative item's stat delta,
  so it never keeps a clearly-worse piece for the bonus. `sets.js` `SET_BONUS_STATS` / `setBonusStats`
  (TUNABLE); `optimizer.js` adds `score(setBonusStats(items), w)` to the scale objective.
- **Survival logic values full avoidance over block beyond the uncrush cap.** Per the principle that
  once you're uncrushable, a dodge/parry/miss negates an entire ~5k spike hit while a block only shaves
  ~275 off a hit that lands, the sim-internal EHP component (`PARTS.ehp`, used by the survival/balanced
  blends — NOT any Sixty Upgrades scale) now rates `dodgeRating 1.1 / parryRating 0.9` (a touch above
  stamina) and `blockRating 0.25` (down from 0.3), widening the full-avoidance-vs-block gap to ~4.4×.
  Block isn't cut further because a survival piece should still beat a pure-threat one — past that point
  the set abandons a block item for spell power (caught by the librams guardrail test). Reaching the cap
  is still priced by `CAP_SCALE` (block chance 2.5×), unchanged. Tunable per the comment.
- **Final meta-activation pass — no more silently-dead metas.** A threat-driven item swap could drop a
  gem color a meta needs (e.g. an agility scroll loosens the crush gate → feet swap from a blue-socketed
  boot to a socketless one → a kept head's "3+ blue" Powerful Earthstorm Diamond falls to 2 blue and
  deactivates), and selection isn't meta-color-aware while a *kept* meta's own sockets can't be
  recolored. Two fixes: (1) an INACTIVE kept meta no longer credits its stats (a locked item's resolved
  stats include the socketed meta gem; that's now subtracted, so a swap that kills the meta is correctly
  seen as a loss, not free threat); (2) a final pass that, when any meta is inactive, searches non-locked
  slots for an owned item that restores the color and keeps the best legal swap that turns every meta
  back on. If the threat genuinely outweighs the meta, no swap wins and the set is left as-is (still
  flagged). `runner.js` `gemSet` now takes a trial selection; new tests assert active metas truly meet
  their requirement on the final gems.
- **Faction is auto-detected from your shoulder inscription (dropdown removed).** Aldor/Scryer shoulder
  inscriptions are rep-locked, so the one you're wearing reveals your faction — the UI now reads it off
  the equipped shoulder (`detectFaction`/`factionFromEnchant` in `enchants.js`) and shows it, instead of
  asking. Falls back to "considering both" if no recognized inscription is equipped.
- **"Unpin all" button.** Each set with pinned slots gets an "📌 Unpin all (N)" button that clears that
  set's pins and re-optimizes (alongside the per-slot unpin).
- **Pin an item to a slot, then re-optimize around it.** Each paper-doll slot's picked item and every
  "≈ also viable" alternate now has a **pin** button: pinning forces that item into the slot for that
  set and re-runs the optimizer on the other slots (the slot shows a gold edge + "📌 pinned · unpin",
  and its alternatives hide while pinned). Pins are **per-goal** (`pinnedSlots[goalId][slotKey]`), so
  the survival set isn't forced to a threat set's choice. Implemented by restricting that slot's pool
  to the pinned item's variants (it can still be gemmed for threat or defense). `runner.js` threads
  `options.pins`; the pinned item's focus/cap variants are preserved so gemming stays flexible.
- **Consumable scrolls (opt-in) to free gem/enchant/item budget.** New Scrolls checkboxes — Scroll of
  Agility V (+20 agi → dodge), Strength V (+20), Intellect V (+20), Protection V (+301 armor) — add
  flat stats that feed the gates, so the optimizer can meet uncrush/uncrit with less gear and spend
  the rest on threat. Primary-stat scrolls ride the buff block (so Kings' +10% applies, as in-game);
  Protection's armor rides a new `flatArmor` channel that bypasses Toughness (which only boosts armor
  FROM ITEMS). `src/scrolls.js`; stacks with Kings/MotW.
- **Improved Righteous Fury's −6% damage taken now folds into EHP.** EHP was armor-only; the 3/3 Imp RF
  damage reduction (gated on the scanned talent rank) now multiplies effective HP by 1/(1−DR) via
  `aggregate`'s `damageTakenMult` → `evaluateSet`. It's a flat factor, so it lifts every set equally
  and doesn't change gear rankings — it just makes the EHP number honest (~6% higher at 3/3).
- **Per-set "gates met" now reflects the FINAL gemmed set, not the selection estimate.** The set
  header reported `legal` from the optimizer's heuristic (which judges gates on approximate raw-gem
  selection stats), so a set whose FINAL socket-bonus-aware gemming came up short of a gate could
  still read "all gates met" while the per-gate badge correctly showed the failure (e.g. "Uncrittable
  5.54%" red next to "all gates met"). `runGoal` now returns `legal: finalLegal(evald)` — the actual
  final set's gate status — so the summary line and the badges agree.
- **Addon v0.7.1 — Shield Block enchant now parsed (block rating was being dropped).** The
  "Enchant Shield – Shield Block" enchant renders on the item as **"+15 Shield Block Rating"** — with
  "shield" wedged between the number and "block rating" — so the addon's `%+(%d+) block rating` phrase
  never matched and the +15 block rating was silently lost from the export (other enchants, incl. the
  +18 stamina shield enchant, parsed fine). That made any Shield-Block-enchanted shield look ~1.9%
  short on block, so a genuinely uncrushable set read as **crushable** — and in keep-mode the optimizer
  would refuse to keep the player's threat shield and over-defend (e.g. swap a Merciless Gladiator's
  Barrier for an Aldori Legacy Defender), costing ~23 spell power. `parseClause` now catches any clause
  naming "block rating" (never "block value") regardless of qualifier words. Verified end-to-end: with
  the fix, the sim's 1:4 / 11.5k / keep-equipped set reproduces the player's hand-built threat set
  exactly (806 SP, 9.18% hit, 102.82% uncrushable, uncrittable — Merciless + Brooch kept). `.toc`
  bumped to 0.7.1; export wire VERSION stays 11 (resolved-field CONTENT improved, format unchanged) —
  re-copy the addon, `/reload`, `/tgs`, re-import.
- **Per-slot "near-identical alternatives" in the readout.** Each paper-doll slot now lists up to 3
  other owned items that score within **1% of the whole-set objective** of the picked piece, each with
  its OWN recommended gems/sockets and the set delta (e.g. "+0.43%"). The optimizer's objective is
  linear in summed item stats, so a slot's marginal value is just `score(item.stats, objScale)` and the
  candidate-vs-pick delta IS the set delta — normalized by the full-set score so "near-identical" means
  swapping that one piece barely moves the set (the player's "basically the same"). An option that
  would miss a gate if dropped in as-is (e.g. a threat neck that gives up the picked neck's resilience)
  is **flagged "needs re-gem"** rather than hidden, since it's still viable once you recover the gate
  elsewhere. This is why, in a high-threat (1:4) raid set, the Brooch of Unquenchable Fury shows as a
  neck alternative to the Pendant of Dominance: equal threat, but it needs the Pendant's lost
  resilience re-gemmed back to stay uncrittable. `runner.js` `nearAlternatives` (+ `ALT_EPS`/`ALT_MAX`),
  exposed as `perSlot[slot].alternatives`; `optimizer.js` exports `distinctOk`; rendered by
  `app.js` `altsHTML`. Tests: `test/alternatives.test.js`.
- **Balanced set is now a blend dial between your Survival and Raid Threat sets, with live updates.**
  Its slider slides between the Survival set (left) and the Raid Threat set (right): it interpolates
  their ratios AND their Min-HP floors, and takes the nearer side's Eye-of-Magtheridon lock — so the
  ends reproduce those two sets exactly and the middle splits the difference. Balanced has no Min-HP
  knob of its own (the floor is derived and shown read-only). UI defaults set to Raid 1:4 / 11.5k,
  Survival 1.5:1 / 14k, AOE 1:4 / 10.5k, Balanced midpoint. The Balanced slider is a fine 0.125-step
  dial; the EHP/Threat end labels are buttons that nudge the slider one step; and after the first
  Optimize, dragging any goal slider re-optimizes live (debounced) so the numbers track the slider.
  Web-layer only (`app.js` `currentGoals`/`optimizeNow`/`scheduleLiveUpdate`); the engine stays
  ratio-generic.
- **Survival beyond the cap now leads with stamina (avoidance valued below it).** Per the research note
  (`research/avoidance-above-cap-vs-stamina.md`): once uncrushable, survival is a FLOOR objective —
  avoidance only improves the average and only vs physical, while stamina (and armor) addresses the
  worst-case spike AND magic damage. Pulled beyond-cap avoidance just under stamina in BOTH the sim's
  internal blend (`PARTS.ehp`) and the exported `survivalEHP` SU scale: dodge 1.1→0.85, parry 0.9→0.7,
  agility 1.15→0.95, defense 1.1→1.0 (survivalEHP block 1.02→0.25 to match; PARTS block already 0.25,
  floored by the librams guardrail). Reaching the cap is unchanged (`survivalUncrushable`, block chance
  2.5×). Effect on a 1.5:1/14k survival set: EHP 34.6k→37.0k, stamina +~75, still uncrushable. 135 tests
  pass. (TBC has no rating diminishing returns — that's WotLK — so this rests on floor/spike/magic.)
- **"Load example" now ships a current TGS11 export (was TGS9).** The bundled `web/sample-export.txt`
  was an old v9 export with no base-socket layout, talents, or item names — so the example couldn't
  demonstrate socket-aware gemming, talent/faction auto-detect, or named items. Replaced with a current
  TGS11 export of the same character (BOM stripped so the header parses). `keep-gems.test` was made
  sample-agnostic (it had hard-coded the old sample's stamina chest gems).
- **Min-HP is now enforced as a true hard gate (with best-effort fallback).** The ratio search's greedy
  gate-repair could get STUCK below a reachable Min-HP floor (e.g. keep-equipped survival returned
  ~13.7k against a 14k floor even though ~15k was achievable). `optimizeSets` now detects a set that
  misses its floor and retries maximizing pure stamina (keeping uncrit/uncrush, dropping the floor from
  the objective so the search isn't pinned below the reachable max): if that reaches the floor it's
  returned as the legal set the ratio search missed; if not, the floor is genuinely unreachable and the
  tankiest achievable set is returned, flagged `hpBestEffort` with a UI note. (Effect: keep-equipped
  survival now hits the 14k floor — 13.7k→15.0k.)
- **Floor recovery respects the threat slider (meet the floor, then maximize threat).** Refines the
  above: when the floor IS reachable, instead of leaving the overshot pure-stamina set, the optimizer
  re-runs the goal's OWN ratio objective SEEDED from the max-HP set (`optimizeHeuristic` gained a
  `seed` option) — the climb then trades the excess stamina back for threat per the slider while the
  Min-HP gate holds the floor. So survival now emphasizes EHP, holds Min-HP as a hard gate, then spends
  the rest on threat per the slider (the mirror of the threat set): keep-equipped survival at a 14k
  floor went from an overshot 14,995/360 SP to 14,027/561 SP. Min-HP slider range widened to 10k–20k.
- **Exclude items (inverse of pin).** Each shown item (the pick and every "≈ also viable" alternate)
  now has an **exclude** button that drops that item from EVERY set's pool and re-optimizes — for gear
  you don't actually have, or just don't want suggested. Excluded items show in a 🚫 banner with a
  re-include × and Clear all (mirrors the locked-gems banner). Excluding an item also clears any pin
  pointing at it. Global by design (unlike per-goal pins); `optimizeSets({ exclude: [itemId,…] })`.
- **Min-HP label and value are nudge buttons.** Like the EHP/Threat end labels, the "Min HP" label
  now steps the floor down and its kHP value steps it up (one slider step each), with live re-optimize.
- **Tighter survival floor recovery (meet floor, then max threat — robustly).** When the Min-HP floor
  binds, the recovery now runs BOTH a ratio-kept and a pure-threat climb (each seeded from the max-HP
  set) and keeps whichever holds the floor with the HIGHEST spell power. This removes the erratic
  overshoot (a 14k floor that used to jump to ~15.0k/360 SP now lands 14,027/561) and makes raising the
  floor a smooth HP↔SP trade (keep-equipped 14.0/14.25/14.5/14.75k → 14,027/561, 14,377/532,
  14,656/503, 14,765/422). Residual jumps are just gear discreteness in keep-mode.
- **"How the sim works" is its own panel.** Split it out of the stat-weights panel into a separate box.
- **One-click addon download in the export how-to.** The "Get the addon & your export" box now has a
  Download button (`addon/TankadinGearSim.zip`, the folder zipped so it extracts as
  `AddOns/TankadinGearSim/`) plus short install steps (unzip into `Interface\AddOns`, enable, `/tgs`).
  Rebuild the zip when the addon changes (see `addon/README.md`).
- **Refresh opens at the top.** Set `history.scrollRestoration = 'manual'` so a reload lands at the top
  of the page instead of restoring the prior scroll position.
- **Fixed survival SP collapsing when the floor binds and the slider leans threat.** At a binding
  Min-HP floor, threat-leaning survival ratios had their recovery candidates gem below the floor and
  get discarded, falling back to the pure-stamina max-HP set (spell power cratering, e.g. 561→360 going
  1.5:1→1:1 at 14k). The floor recovery now sweeps a range of EHP-leans (all seeded from max-HP), keeps
  only the ones whose FINAL set holds the floor, and picks the floor-holder the goal's OWN ratio scores
  highest — so SP holds at the floor-capped max instead of collapsing. Below a binding floor the slider
  still trades smoothly (SP rises with threat).
- **Smooth, monotonic slider drags (seed from the adjacent set).** Live slider re-optimizes now pass the
  PREVIOUS result's per-slot selection as a seed, so each nudge climbs from the adjacent (good) set
  instead of restarting the heuristic cold. This kills the small non-monotonic wiggles (e.g. an SP dip
  while sliding toward threat, when it should only rise). Fresh (non-live) Optimize runs still seed from
  scratch. Reuses the existing `seed` plumbing in `optimizeHeuristic`/`runGoal`; the web layer builds
  `options.seeds` per goal from `lastResults` only on live drags.
- **Sample-first onboarding.** The "Your gear" panel now leads with a prominent "▶ Try it with a sample
  character — no addon needed" button; loading the sample (or uploading a file) auto-runs the optimizer
  and smooth-scrolls to the results, so the value is visible before any addon install. The addon how-to,
  paste box and file upload moved into a collapsed "Use your own gear" disclosure. A "Use my own gear →"
  CTA appears under the demo results (only while viewing the sample) and opens that disclosure.
- **First-visit polish.** Slider end labels are now pill buttons with ◂ / ▸ arrows (clearly clickable
  nudges); dragging a goal slider re-optimizes as soon as gear is loaded (previously dead until the first
  explicit Optimize, which felt broken); Faction and locked-trinket controls show an italic "Available
  after you load gear" placeholder and stay disabled until gear loads.
- **Survival slider no longer dips at a binding floor (live drags).** The Min-HP floor-recovery branch
  seeded every candidate from the cold pure-stamina set, so the live per-drag seed never reached the
  survival set — each nudge re-derived candidates cold and the arg-max flipped, dipping spell power.
  Recovery now climbs from the previous live set (`gseed`) when present (falling back to the max-HP seed
  when cold, so non-live runs and tests are unchanged), removing the spurious dips. A residual decline at
  a hard-binding floor is genuine (more threat-gemming sinks HP, so holding the floor forces lower-SP
  pieces), not a heuristic artifact.
- **Setup panel decluttered.** "2 · Setup" now shows only Professions + Stat buff plus a "defaults are
  fine — just hit Optimize" hint; Gem phase, Faction, Locked trinkets, Scrolls and Talents moved under a
  collapsed "Advanced settings (optional)" disclosure. "Keep gems &amp; enchants" was split out of the
  Stat-buff field into its own "Gems &amp; enchants" field (with the Imbued-meta checkbox grouped beside
  it, since it's a gem, not a buff). No engine change — controls keep their ids/behavior.
- **Glossary tooltips at point of use.** EHP, Uncrittable, Uncrushable, Min HP, def-gemmed and kept now
  render with a dotted underline + help cursor in the summary table, gate badges, Survival panel and
  slot tags; hovering shows a plain-English definition and clicking opens the "How the sim works" panel.
  The jargon stays visible/precise (a credibility signal) but is decodable in place.
- **Balanced dial polish.** The Balanced goal is now visually separated (full-width row, divider, gold
  name, a "blend dial over your Survival &amp; Raid sets" caption) so its different mental model reads
  clearly; the slider was halved to 24 increments (less fiddly). Min-HP now shows "off" instead of "10.0k"
  whenever a goal's floor is at the 10k floor. Engine: the Balanced ends now reproduce the Survival/Raid
  sets exactly — at an end it COPIES that end goal's already-solved result instead of re-optimizing (the
  Min-HP floor-recovery heuristic is seed/path-dependent, so a fresh solve could land on a tankier,
  lower-threat floor-holder); between the ends it also climbs from the nearer end's set and keeps the
  higher-scoring of that vs the self-seeded solve, so the middle stays smooth.
- **Displayed Spell Damage now reconciles with Sixty Upgrades.** A modeled libram (e.g. Libram of the
  Eternal Rest) is valued as EQUIVALENT spell damage so the threat scales score its Consecration effect —
  but that isn't literal +spell-power on the tooltip, so Sixty Upgrades (scoring off real item stats)
  never showed it, making the sim's number read higher than SU by exactly the libram's value. The set
  card and summary now show LITERAL spell power (what SU reconciles against) and surface the libram's
  threat-equivalent separately ("Relic effect (≈SP) +N", with a tooltip). The optimizer still uses the
  full value (`agg._raw`), so set selection is unchanged — the threat libram still wins the threat sets.
  Engine exposes `agg.spellPowerLiteral` / `spellPowerEquiv` / `spellPowerEquivSource`.
- **Fixed: a uncrushable-required set could come back CRUSHABLE when a legal set existed.** With a
  threat-leaning ratio (e.g. raid EHP 1:4) the greedy+repair heuristic could keep the higher-threat libram
  (Eternal Rest) and land ~0.1% short of the 102.4% crush cap — returning a crushable, illegal set even
  though swapping to the block libram (Repentance) cleared the gate comfortably. The Min-HP floor-recovery
  in `optimizeSets` now also triggers when the uncrushable gate is unmet: it sweeps EHP-leans, keeps only
  FULLY-legal sets, and picks the one the goal's own ratio scores highest — so a threat goal still
  maximizes threat AMONG the sets that actually clear the gates. AOE Trash (crush gate dropped) is
  unchanged. Added a regression test (`librams.test.js`).
- **Hint: surplus avoidance locked by kept gems.** When an uncrushable set sits ≥1.5% over the crush cap
  AND has kept (frozen) gems, the set card now shows a tip: the surplus avoidance is locked in and can't
  be re-gemmed into threat — switch "Gems &amp; enchants" to "Re-gem everything" (or unlock pieces) to
  convert it to spell damage. (With re-gem mode the optimizer already trims to the cap, so the hint stays
  hidden.)
- **Shareable result links.** A "🔗 Copy share link" button on the results panel encodes the whole
  optimization — gear + every setting + goal sliders + pins/locks/excludes — into the URL hash, gzipped
  and base64url-encoded entirely client-side (nothing is uploaded; the gear rides inside the link).
  Opening the link rebuilds the inputs and re-optimizes to the same sets. The shared gear is slimmed to
  actual equipment (consumables/ore/coins/bags dropped — the optimizer ignores them, and it cut the
  worst-case link ~28% with byte-identical results). Falls back to uncompressed encoding on browsers
  without CompressionStream.
- **Item links now iconize + quality-color via Wowhead.** `index.html` loads Wowhead's `power.js`
  (`whTooltips = { colorLinks, iconizeLinks, renameLinks }`), but that script only scans the page on
  load while our results render dynamically afterward. `render()` now calls `whRefresh()`, which invokes
  `$WowheadPower.refreshLinks()` after each render to iconize, quality-color, and hover-tooltip the
  freshly-rendered `wowhead.com/tbc/item=<id>` links. It retries briefly (8×, 400ms) in case the deferred
  script hasn't loaded yet, then power.js self-scans.
- **"Also viable" alternates collapsed into a per-slot dropdown.** Each paper-doll slot's near-tie
  alternatives are now a `<details>`/`<summary>` ("≈ N also viable") that's collapsed by default, so a
  slot with several near-ties no longer clutters the set card. Expanding reveals each alternate with its
  gems + pin/exclude controls as before. Summary marker flips ▾/▴ and mirrors (row-reverse) on
  right-hand slots to match the paper-doll layout.
- **Asset cache-busting.** `index.html` referenced `web/app.js` / `web/style.css` with no version query,
  so after a GitHub Pages deploy a normal browser reload kept serving the cached old files (a change had
  to be hard-refreshed to show up). `bin/stamp.mjs` (`npm run stamp`) now rewrites a `?v=<hash>` on each
  asset URL to an 8-char SHA-256 of that file's bytes — the URL changes exactly when the file content
  does, and only for the file that changed. A tracked pre-commit hook (`scripts/githooks/pre-commit`, via
  `git config core.hooksPath scripts/githooks`) re-stamps and re-stages `index.html` automatically whenever
  a commit touches those assets. (On a fresh clone, run the `core.hooksPath` config line once to enable it.)
- **Curated community BiS in each slot dropdown.** New `web/bis.js` carries a per-phase (1–5), per-slot
  best-in-slot reference list (top ~3 picks/slot) extracted from Wowhead's "Protection Paladin Tank BiS"
  guides — filtered to items whose real equip slot matches, so gems/tokens/currencies that the guides
  mention in prose are excluded. It's appended to the end of each slot's dropdown as a "Phase N BiS"
  block; items you already own (or have in the current set) are tagged. It's **reference only** — fully
  independent of your collection and never selected by the optimizer. The "Gem phase" control was renamed
  **Content phase** (now Phase 1–5; gems are unchanged past p2, so 4/5 just pick the later BiS list) and
  re-optimizes live on change. The per-slot `<details>` now opens whenever there are owned near-ties OR a
  BiS list (so a slot always exposes "what to chase").
- **Equipped vs swapped-in pieces are marked.** Each paper-doll slot shows a **● worn** badge when the
  pick is gear you already wear in-game, or a **swap in** badge (plus a faint blue left-edge accent) when
  the optimizer pulled it from your bags/bank — read from the export's `E:`/`I:` line (survives share
  links).
- **"Pin" is now "Equip."** The pin/unpin slot controls read **equip** / **📌 equipped · unequip**, and
  "Unpin all" → "Unequip all" — same force-into-slot behavior, clearer verb. (The currently-worn marker
  above deliberately uses "worn", not "equipped", to avoid colliding with this.)
- **Open Sixty Upgrades link by the export button.** A "Open Sixty Upgrades ↗" link sits next to
  "⬇ Export to Sixty Upgrades" so you can copy the string and jump straight to the import page.
- **"Needs re-gem" is now an obvious tooltip.** The alternates flag is a dotted-underline `<abbr>` with a
  help cursor and a fuller explanation (which gate it would miss, and that you'd re-gem another slot for
  the avoidance/defense/resilience it gives up).
- **Armor shows what it mitigates.** Hovering the Armor stat in the Defense panel reports the % physical
  damage reduction vs a raid boss (the same `Armor ÷ (Armor + K)`, capped 75%, folded into EHP).
- **Slot dropdowns are an accordion.** Opening one slot's dropdown (owned alternates + BiS) now closes
  any other that's open, so the paper doll never stacks several expanded lists at once.
- **BiS items you own are equippable.** A BiS row for an item in your loaded gear gets an **equip**
  button (same force-into-slot as an owned alternate); items you don't own show "not in your bags" (the
  optimizer can't model gear you don't have). BiS entries can carry a curator **ⓘ note**.
- **Tome of Fiery Redemption added to early-phase trinket BiS.** Its on-use +spell-damage proc can't be
  scored by the model (so it never surfaces in the auto-generated list), but it's stronger single-target
  threat than Eye of Magtheridon — added by hand to the Phase 1–2 trinket lists with an ⓘ note.
- **Spell-hit cap tooltip.** The summary "Spell hit" header and each set's Spell-panel row explain the
  17% raid-boss cap and how far below it the set is (below the cap, spell hit recovers missed threat).
- **Miss added to the Defense panel.** A "Miss" row (boss-misses-you chance: base + defense-skill bonus)
  sits between Block and Dodge, with a tooltip; it's part of the avoidance/uncrushable total.
- **BiS shown on empty slots.** A slot nothing in your gear fills now still shows the "what to chase"
  BiS dropdown (previously empty slots rendered nothing).
- **BiS data integrity test.** `test/bis-data.test.js` guards `web/bis.js` — phases present, only valid
  slot keys, every entry a positive-int id + non-empty name, no dup ids per slot, and the manual Tome of
  Fiery Redemption addition stays put. (140/140 suite.)
- **"How the sim works" updated for the new controls.** Section 7 now says **Equip** (matching the
  renamed control) and documents the per-slot community-BiS reference list (reference-only, owned items
  equippable, hard-to-model exceptions flagged).
- **Mobile layout for the new elements.** The ≤760px single-column view now un-mirrors the worn/swap
  badges, BiS rows, and the swapped-slot edge accent (they no longer inherit the right-column reversal).
- **Equip BiS items you don't own (planning aid).** A BiS pick that isn't in your bags now has a
  **"+ add to sim"** button: it folds the item into the optimizer pool as a *planning* item ("pretend I
  own this"), pinned to the slot, and re-optimizes — so you can see how a not-yet-acquired upgrade
  reshapes a set (gemmed/enchanted like real gear). Planning items show a **★ planned** badge and are
  listed in an **"Added for planning"** banner with a one-click remove (also captured in share links).
  New generated `web/bis-items.js` carries the stat block + sockets for every BiS item (from the same
  Wowhead `jsonequip`); librams get their modeled threat effect via `libramStats`. Socket bonuses aren't
  modeled for planning items (Wowhead encodes them as an unresolved id), so a planned item just isn't
  credited its socket bonus. `test/bis-equip.test.js` runs a synthetic item through the real optimizer
  (placed when pinned; every DB entry optimizer-ready; DB covers every display id). (143/143 suite.)
- **Socket bonus is now permutation-aware — no more forfeiting a FREE bonus.** `bonusKept` used to check
  whether each gem fit the socket it was *tagged* to, but the player chooses which gem goes in which
  socket — so what matters is whether the chosen gems can be assigned (in *some* order) to fill every
  socket by color. The greedy per-socket pick and, especially, the meta recolor could leave a hybrid gem
  tagged to an off-color socket while a sibling that fits it sat elsewhere (e.g. a purple Nightseye in
  the RED socket and an orange Noble Topaz in the BLUE socket), reporting the bonus "skipped — not worth
  an off-color gem" when the very same gems, re-slotted, earn it for nothing. New `reassignForBonus`
  (Kuhn's bipartite matching, sockets ≤4) finds the max-fit assignment, **relabels each gem's socket** so
  the readout shows the earning layout, and `bonusEarnedAsTagged` gates crediting: a bonus the relabel
  newly earns (which `planItemGems` had forfeited and so left out of the set stats) is now added back as
  the free mitigation it is. Reassignment only ever *earns* a bonus, never loses one, so genuine
  forfeits (3× orange can't fill a blue socket) stay skipped. `test/socket-bonus-reassign.test.js`.
  (149/149 suite.)
- **Cache-busting now covers the whole ES-module graph (deterministic deploys).** The stamp only
  fingerprinted `web/app.js` + `web/style.css`, but those pull in all of `src/` (and `web/bis*.js`) as
  ES modules with un-versioned relative imports — so an *engine* change could keep serving a stale
  `src/` file from the browser cache after a deploy (a plain reload wouldn't refetch it). `bin/stamp.mjs`
  now crawls the module graph from `web/app.js` and writes a content-hashed **`<script type="importmap">`**
  into `index.html` (between `importmap:start/end` markers): every module maps to a `?v=<hash>` URL, so
  the browser resolves `app.js`'s imports to versioned URLs and busts caches exactly when a file's bytes
  change — **without** rewriting the source imports (only `index.html` changes, no per-file cascade). The
  pre-commit hook now re-stamps on any `src/`|`web/` `.js`/`.css` change (was: only app.js/style.css).
  Relies on import-map support (Chrome 89+, Firefox 108+, Safari 16.4+). Safe by construction: the static
  host ignores the `?v` query, so even a browser that skipped the map just loads the same file un-versioned.
- **Addon grows an in-game LIVE readout (v0.8.0) — the sim starts moving in-game.** The companion addon
  is no longer export-only: `/tgs` now opens a window whose **Live tab** reads your equipped set straight
  off the character sheet and shows crit reduction vs raid/heroic (uncrittable ✓/✗ + surplus), the
  avoidance breakdown (miss/dodge/parry/block), total avoidance with/without Holy Shield, **uncrushable**
  status + crush surplus, armor DR, health, physical EHP, spell power and block value — recomputing live
  as you swap gear (a **Holy Shield up** toggle flips the +30% block). This is the first slice of turning
  the browser sim into an in-game tool (see `snappy-forging-knuth` plan): the optimizer + gem/enchant
  solver stay on the website for now. The old exporter is unchanged, split out to `Exporter.lua` and moved
  behind the window's **Export tab** (`/tgs export`). Structure: the addon now loads `engine/{Constants,
  Combat,Evaluate}.lua` — a hand-port of `src/{constants,combat,character}.js` that feeds live sheet
  values into the same `evaluateSet` the website uses (no forward model needed in-game, since the game
  already computes the sheet finals). **Anti-drift parity:** `bin/gen-fixtures.mjs` emits the JS
  `evaluateSet` goldens (from the `sheet-parity` inputs) to `test/lua/fixtures.lua`, and
  `test/lua/eval_parity.lua` runs the ported Lua engine against them within 1e-6 — verified **69/69 field
  checks across 5 fixtures** (run under a Lua VM; JS suite still 149/149). UI is native frames for the MVP
  (loads on a plain folder-copy, no external libs); Ace3 + CurseForge packaging are the next phase.

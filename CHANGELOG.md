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
- **Addon v0.8.1 — fix live resilience read (was reporting crittable when uncrittable) + text
  overlap.** On the Anniversary client `GetCombatRating(CR_CRIT_TAKEN_MELEE)` was coming back 0, so
  the Live tab counted **zero resilience** and under-reported crit reduction — e.g. a real 5.88%
  (uncrittable) showed as 5.20% ("CRITTABLE"). `Core.lua` now reads resilience robustly: it tries
  `GetCombatRating` across the crit-taken indices (melee/spell/ranged CR_* globals) and, if those are
  0, falls back to the % the game reports via `GetCombatRatingBonus` converted back to a rating.
  (The website never hit this — it parses resilience off item tooltips.) Added **`/tgs debug`** to
  print the raw API reads (defense/avoidance + per-index resilience rating & bonus) so any future
  live-vs-website mismatch can be pinned to the exact source. Also widened the window and moved the
  value column right so long avoidance labels no longer overlap their numbers. Everything else in the
  screenshot reconciled: miss/dodge/parry/block, armor, block value, health all matched the Tankadin
  II WeakAura; the DR/EHP difference is expected (TGS mitigates vs a level-73 raid boss, the WA does not).
- **Addon v0.8.2 — resilience off gear (real crit fix) + Holy Shield / block-libram accuracy.** Two
  live-readout bugs the v0.8.1 fix hadn't closed, both in `Core.lua`:
  - **Still crittable.** v0.8.1's `GetCombatRating`/`GetCombatRatingBonus` reads *both* return 0 on the
    Anniversary client, so resilience was still dropped (5.20% shown vs a real 5.88% → "CRITTABLE").
    Now resilience is summed straight off equipped gear via `GetItemStats` per slot (the reliable path,
    mirroring how the website reads it off tooltips — gems in the item link are included); the broken
    combat-rating reads remain only as a fallback when that API is unavailable.
  - **Holy Shield double-counted (and the block libram).** `GetBlockChance()` already reflects a *live*
    Holy Shield aura (+30% block) and a block libram's HS-conditional block, so adding the +30 again
    inflated the crush table — with HS actually up in-game the Live tab read **134.07% / "+31.67%"**
    when reality (and the WA) is **104.07% / +1.67%**. `Core.lua` now detects the live HS aura and the
    equipped block libram (Libram of Repentance, +42 block rating → `BLOCK_LIBRAMS`), strips them back
    out to a Holy-Shield-free base block, and re-adds the assumption once (`hsBonusFull` = 30 + libram)
    — so the with/without-HS numbers are consistent whether or not HS happens to be up, and the "assume
    Holy Shield up" toggle now also credits the block libram when HS is down. The avoidance row shows the
    effective (HS-inclusive) block so it matches the WeakAura's live figure. `/tgs debug` extended to
    print the gear-scanned resilience, live-HS state, block-libram rating, and base-vs-effective block.
    (`engine/{Evaluate,Combat,Constants}.lua` unchanged, so the 69/69 parity harness is unaffected.)
- **Phase B (part 1) — CurseForge release pipeline.** Distribution scaffolding so a `v*` git tag
  publishes the addon, without touching the working folder-copy install. Added a repo-root
  **`.pkgmeta`** ([BigWigsMods/packager](https://github.com/BigWigsMods/packager)) that lifts
  `addon/TankadinGearSim/` out of the web repo (via `move-folders` + an `ignore` list) so the zip
  extracts cleanly as `AddOns/TankadinGearSim/`; a **`.github/workflows/release.yml`** that runs the
  packager on `v*` tags, attaches the zip to a **GitHub Release**, and uploads to **CurseForge** when
  a `CF_API_KEY` secret + project id are present (skips the CF step gracefully until then); CurseForge
  `## X-Category`/`X-License`/`X-Website` `.toc` metadata (project-id line left commented until the
  project exists); a root **`LICENSE`** (MIT, matching `package.json`); and **`addon/PUBLISHING.md`**
  documenting the user-only setup (create the CF project, add the id, generate an API token, add the
  GitHub secret) and the tag-to-release flow. **Ace3 UI is deliberately deferred** — the native-frame
  MVP loads on a bare folder-copy (good for in-game iteration); the Ace3 externals block sits
  commented in `.pkgmeta`, to be enabled when `UI.lua` is ported (which is also where the requested
  Tankadin-II-WeakAura reskin will land).
- **Phase C (part 1) — constants generator + drift guard.** `bin/gen-lua-data.mjs` (npm run
  **`gen-lua`**) imports `src/constants.js` and regenerates `engine/Constants.lua`, making the JS the
  single source of truth for the addon's DATA — a value edit on the website now flows straight into the
  in-game engine. Output is idempotent (two runs byte-identical) and reproduces the prior hand-stub's
  values exactly (only cosmetic diffs: comment alignment, `1.10`→`1.1`). Per the plan's "generate data,
  hand-port logic" split, the two helper *formulas* (`ARMOR_CONST`/`RESIST_DENOM`) are emitted from a
  fixed template and remain backstopped by the Lua parity harness, not the import. The **pre-commit
  hook** now re-runs the generator and stages `Constants.lua` whenever `src/constants.js` (or the
  generator) is committed — same discipline as the existing asset-stamp step — so the two can't drift.
  (`bin/gen-fixtures.mjs` + `test/lua/eval_parity.lua` already covered the *logic* parity in Phase A;
  this closes the DATA half. The remaining Phase C/D generators — gems/enchants/BiS tables — are
  additive once the optimizer port begins.)
- **Addon v0.8.3 — Live tab reskinned to the Tankadin II WeakAura look.** Cosmetic pass on the Live
  pane (`UI.lua`) at the user's request: a compact vertical stat-stack instead of the wide two-column
  table — **gold** stat labels, **cyan** values, grouped Avoidance (Miss/Dodge/Parry/Avoid/Block) ·
  Caps (Crit raid + heroic, Crush) · Mitigation (Block value/Armor/Armor DR/EHP·HP) · Throughput
  (Spell power), on the existing **black background**. Pass/fail now uses the built-in green-check /
  red-cross ready-check textures with green/red value coloring (raid-crit, heroic-crit, crush each get
  their own mark), and the crush/crit rows show `value / threshold`. Avoid = miss+dodge+parry and Block
  is the effective (HS-inclusive) figure, matching the WeakAura's rows. The window is now **narrow on
  the Live tab** and widens only for the Export tab (whose copy box is unchanged). Done in native
  frames (no Ace3) so the bare folder-copy dev loop keeps working; the styling carries over when the UI
  is later ported to Ace3.
- **Addon v0.8.5 — Live readout reacts to buffs (Holy Shield / Righteous Fury).** The Live tab wasn't
  updating when auras changed — it only listened for gear/stat events, not `UNIT_AURA` — so casting
  Holy Shield or buffing Righteous Fury moved nothing. Three fixes in `Core.lua`:
  (1) register `UNIT_AURA` (player) so the readout recomputes on buff changes;
  (2) the Holy Shield block bonus now applies when HS is **live OR assumed** (was: only when the toggle
  was on, then normalized back out) — so **casting Holy Shield now moves Block + Crush live** with the
  toggle off, while the toggle still previews it when HS is down (still no double-count: a live aura is
  stripped to base then the bonus re-added once);
  (3) **Improved Righteous Fury's damage reduction** (2%/rank, only while RF is up) is detected live
  from the RF aura + talent rank and folded into physical **EHP** via `damageTakenMult` — so EHP rises
  ~6% at 3/3 when RF is up. (Armor DR is unchanged by RF/HS by design — neither touches armor; it only
  moves with armor.) `/tgs debug` now prints RF state / rank / damageTakenMult. `.toc` → 0.8.5.
  - Reconciled against the Tankadin II WeakAura: with RF up, TGS EHP +6.38% (26038→27700) vs the WA's
    +11.11% (→28931). TGS is correct — `/tgs debug` confirmed `impRF rank=3, damageTakenMult=0.940`
    (textbook 3/3 = 6%); the WA's 10% over-counts physical damage reduction by ~4% (likely folding in a
    magic-only reduction like Spell Warding). No engine change.
- **Addon v0.8.6 — `/tgs debug` dumps to the Export copy box.** `Core.debug()` now also returns its
  text and the slash handler opens the window on the Export tab with the debug lines in the copy box
  (`UI.ShowDebug`), so you can Ctrl+C it instead of digging through chat. Still prints to chat too.
  `.toc` → 0.8.6.
- **Addon v0.8.7 — in-game optimizer, D2: forward model (internal, no UI yet).** Second Phase-D brick:
  the first-principles forward calc that turns a hypothetical item selection into the sheet stats
  `evaluateSet` consumes (what the optimizer needs to score a candidate set — the Live readout still
  reads finals off the sheet directly). `bin/gen-lua-data.mjs` now also generates
  **`engine/CharacterData.lua`** (the L70 Blood Elf Paladin base intercepts, default talent mods, and
  Kings/MotW buffs — `CHARACTER`/`TALENTS`/`BUFFS`/`STAT_KEYS` from `src/model.js`). Hand-ported
  **`engine/Model.lua`** mirrors `model.js`'s `aggregate`, `talentsFromRanks`, and `sumStats` — incl.
  the Kings ×1.10 multiplier applied after flat buffs, Toughness item-armor scaling, the Strength/20
  block-value term, and Improved-RF `damageTakenMult`. Anti-drift: `bin/gen-model-fixtures.mjs` →
  `test/lua/model_fixtures.lua` (aggregate over gear × {unbuffed, Kings, Kings+MotW, scroll+HS, alt
  talents} + `talentsFromRanks` rank maps); `test/lua/model_parity.lua` checks the Lua port. Pre-commit
  drift guard extended (regen `CharacterData.lua` + model goldens on `src/model.js` changes). Loads in
  the `.toc` but not wired to any UI. JS suite still 149/149. `.toc` → 0.8.7.
- **CI + local Lua parity (verify the ported addon).** Added `.github/workflows/ci.yml`: on push/PR it
  runs the JS suite, checks every generated Lua/fixture is in sync with its JS source (regenerate +
  `git diff`), syntax-checks **every** addon `.lua` under Lua 5.1 (`luac -p` — WoW's Lua version, so it
  covers the WoW-facing `Core`/`UI`/`Exporter` files too), and runs the three parity harnesses
  (`eval`/`scoring`/`model`) — turning all the previously "unrun locally" parity work into an actual
  green check. Also added `bin/run-lua-parity.mjs` + `npm run test:lua:wasm`: runs the same syntax pass
  + parity harnesses locally **without a native Lua** via `wasmoon` (kept out of `package.json` so the
  repo stays dependency-free — the script prints `npm i -D wasmoon` if it's absent). This immediately
  earned its keep: it caught a real bug — the model fixtures emitted talent-rank keys with spaces
  (`Sacred Duty = 2`) as bare Lua identifiers (a syntax error); `gen-model-fixtures.mjs` now
  bracket-quotes non-identifier keys (`["Sacred Duty"] = 2`). Verified: syntax PASS (11 files) + 313
  parity checks (69 + 118 + 126) all green.
- **Addon v0.8.8 — in-game optimizer, D3a: item-object builder (internal, no UI yet).** The pure half
  of the live item pool — turning raw GetItemStats/tooltip reads into the structured item objects the
  optimizer consumes (`{ slot, stats, baseStats, sockets, socketBonus, itemId, gems, … }`), mirroring
  `src/import.js`. `bin/gen-lua-data.mjs` now also generates **`engine/ItemsData.lua`** (the
  `STAT_KEY_MAP` GetItemStats-key→our-stat and `SLOT_MAP` equipLoc→slot maps, now `export`ed from
  `import.js` so they're single-sourced). Hand-ported **`engine/Items.lua`** does the logic:
  `parseItemString`, `mapStats`, `socketsFromStats`, `parseSocketBonus`, and `build` — incl. the
  shield armor-backfill and the base>resolved stat-lift import.js does. Anti-drift:
  `bin/gen-items-fixtures.mjs` drives `import.js`'s `parseExport` with synthetic exports (one item per
  stat-key + per slot, plus the backfill/lift/unmapped-slot cases) for goldens →
  `test/lua/items_fixtures.lua`; `test/lua/items_parity.lua` deep-compares `Items.build` against them
  (**412 checks, 26 items**). CI + `run-lua-parity` + the drift guard extended. The WoW-API reads that
  feed this (bag/bank/equipped scan) are D3b. Loads in the `.toc`, no UI yet. JS suite 149/149;
  full parity now **725 checks** (69+118+126+412). `.toc` → 0.8.8.
- **Addon v0.8.9 — in-game optimizer, D3b: live item pool.** The WoW-API half of D3, completing the
  live gear read. Refactored `Exporter.lua` to expose a shared **`readItemRaw(link)`** (tooltip scan +
  live socket layout + gem/enchant-stripped `GetItemStats` + socket bonus + equipLoc/name) — the export
  string is byte-identical (same reads, just factored out of `itemSegment`). New **`ItemPool.lua`**
  (`ns.ItemPool.scan()` / `bySlot()`) iterates equipped + bags + open bank, dedupes by item string,
  feeds each through `readItemRaw` → `engine/Items.build`, and groups by slot — the in-game replacement
  for the website's export-string round-trip (`import.js`), producing the same item objects read
  straight from the game. Impure (inventory APIs), so it's syntax-checked (compile pass, 14 files) but
  not parity-tested; the real check is in-game. Not wired to any UI yet (D6). `.toc` → 0.8.9.
- **Addon v0.8.10 — in-game optimizer, D4: gem/enchant solver (internal, no UI yet).** Ported the gem
  and enchant recommendation half of the optimizer. `bin/gen-lua-data.mjs` now also emits five data
  tables — **`engine/{GemsData,EnchantsData,ProfessionsData,LibramsData,ScrollsData}.lua`** — from
  `src/{gems,enchants,professions,librams,scrolls}.js` (via a general nested Lua-literal serializer; a
  `luaKey` tweak emits integer keys as `[n]` so id-keyed maps like the shoulder-faction table look up by
  number). Hand-ported logic in **`engine/{Gems,Enchants,Professions,Librams,Scrolls,GemSolver}.lua`**:
  `bestGem`/`bestMeta`/`metaActivated`/`metaConditionHolds`, `bestEnchant`/`detectFaction`/
  `factionFromEnchant`, `professionPerks`, `libramStats`, `scrollStats`, and the full `gemsolver.js`
  (`gemWeights`, `reassignForBonus` (Kuhn's bipartite matching), `bonusEarnedAsTagged`, `recommendGems`,
  `recommendEnchants`, `planItemGems` per-item socket-bonus worth-it, `solveLoadout`). The **libram
  effective-stat override deferred in D3a now lands in `engine/Items.build`** (mirrors `import.js`),
  referenced lazily so Items stays loadable without the solver. Anti-drift: `bin/gen-solver-fixtures.mjs`
  runs the JS functions over ~600 representative inputs → `test/lua/solver_fixtures.lua`;
  `test/lua/solver_parity.lua` asserts the ports reproduce them (**751 checks**). Libram cases added to
  the items fixtures (items parity 412 → **440**), so the override is parity-tested where it lives. Full
  Lua suite now **1504 parity checks** (69+118+126+440+751) + a 25-file syntax pass, all green under
  wasmoon; CI + the pre-commit drift guards + `run-lua-parity` wired for the new files. JS suite 149/149.
  `.toc` → 0.8.10. **D4 done** — next is D5 (search in a frame-yielding coroutine) then D6 (Optimize tab).
- **Addon v0.8.11 — in-game optimizer, D5a: optimizer core (internal, no UI yet).** Ported the search
  itself — `src/optimizer.js` → **`engine/Optimizer.lua`**: `buildPool` (group by slot, expand paired
  ring/trinket distinct groups, 2H exclusion, locks), `distinctOk`, the gate helpers (`gatesPass`/
  `gateDeficit`, crit + uncrushable + Min-HP floor), `objectiveFn` (builtin spellPower/ehp + the 'scale'
  weight-blend), the greedy **repair→climb heuristic**, and the exhaustive solver. Since Lua tables have
  no key order (and the JS relies on `Object.keys(pool)` insertion order for swap tie-breaks), buildPool
  returns an explicit **`order`** array every search iterates, and seed picks use a first-max scan (==
  JS's stable-sort `[0]`) — so the port is deterministic and matches JS. Its `'scale'` objective needs
  tier set bonuses, so `src/sets.js` was ported too: generated **`engine/SetsData.lua`** (SET_DB /
  SET_BONUS_STATS) + hand-ported **`engine/Sets.lua`** (`setCounts`/`setBonusStats`). Anti-drift:
  `bin/gen-optimizer-fixtures.mjs` runs the JS over a synthetic pool × goals → `optimizer_fixtures.lua`
  (with legal sets so the climb branch + a non-nil exhaustive result are exercised);
  `test/lua/optimizer_parity.lua` asserts the ports pick the same selection / objective value / legality
  (**52 checks**). Full Lua suite now **1556 parity checks** + a 28-file syntax pass, all green under
  wasmoon; CI + pre-commit drift guards + `run-lua-parity` + a `gen-optimizer-fixtures` script wired.
  JS 149/149. `.toc` → 0.8.11. Next: D5b (`runner.js` orchestration — runGoal/optimizeSets, gate-aware
  re-gem, reclaim, floor recovery, meta-repair, near-alts) then D5c (frame-yielding coroutine) → D6 (UI).
- **Addon v0.8.12 — in-game optimizer, D5b: four-set orchestration (internal, no UI yet).** Ported the
  whole `src/runner.js` → **`engine/Runner.lua`** — the piece that ties everything together into the four
  tuned sets (raid threat / survival / AOE trash / balanced). `runGoal`: builds each owned item's focus
  + cap gem variants (`itemVariants`/`buildVariant`), runs the `Optimizer` search, gems the selection
  socket-bonus-aware (`gemSet` → `GemSolver.planItemGems` + `resolveMetas` meta-aware gemming with cheap-
  socket recolor), then the GATE RECOVERY (re-gem gate-aware when a gate is missed), RECLAIM (flip def
  gems back to threat while legal), FINAL META repair (swap to restore a dropped meta color), and
  `nearAlternatives`. `optimizeSets`: buff/scroll merge, ctx, `solveGoal` Min-HP floor recovery (max-HP
  seed + EHP-lean sweep), and the Balanced end-copy / dual-seed. Threads the D5a slot `order` through so
  gemChoices/plan order + swap tie-breaks match JS exactly; JS-stable sorts (`enableMeta`,
  `nearAlternatives`) carry an explicit original-index tie-break. Anti-drift: `bin/gen-runner-fixtures.mjs`
  runs the JS `optimizeSets` over a synthetic pool (socketed pieces + a meta socket, a Justicar 2pc, a
  libram, the trinket-lock ids, a keep-lockable neck) × 4 option sets (buff/professions/faction/meta-
  exclude/keep-mode/phase/custom Min-HP goals) → `runner_fixtures.lua`; `test/lua/runner_parity.lua`
  deep-compares each goal's **selection / agg / evald / gemChoices / metas / per-slot gems+enchant+
  alternatives / buffImpact** (**15 goal results**, all fields). All green under wasmoon; CI + pre-commit
  drift guard + `run-lua-parity` + a `gen-runner-fixtures` script wired. JS 149/149. `.toc` → 0.8.12.
  **D5 logic complete** — remaining: D5c (run the search in a frame-yielding coroutine) then D6 (Optimize tab).
- **Addon v0.8.13 — in-game optimizer, D5c: frame-yielding search (internal, no UI yet).** So a full
  solve never hitches the client, the search now runs across frames. Added a cooperative-yield hook
  (`ns.engine.onTick`, a **no-op unless set** — sync/parity path unchanged) called at the heavy-loop
  boundaries in `engine/Optimizer.lua` (repair/climb iterations, exhaustive top candidates) and
  `engine/Runner.lua` (each `runGoal`, the reclaim + meta-repair loops, each goal in `optimizeSets`), plus
  an `ns.engine.onProgress(done,total)` hook per solved goal. New impure **`AsyncSearch.lua`**
  (`ns.Async.optimizeSets(items, options, onDone, onProgress, onError)`) drives `Runner.optimizeSets` in a
  **coroutine** from an `OnUpdate` ticker with a per-frame time budget (`debugprofilestop`, 12ms): the hook
  yields once the budget is spent, the ticker resumes next frame; returns a `:cancel()` handle. Impure, so
  compile-checked only — but the RESULT is provably identical to the sync path: new
  `test/lua/async_parity.lua` drives `optimizeSets` in a coroutine yielding on EVERY tick (maximal
  suspend/resume churn) and asserts the selection/SP/HP/legality match the synchronous run across all
  option sets. Full Lua suite now **8 harnesses**, all green under wasmoon (30 addon files syntax-checked).
  JS 149/149. `.toc` → 0.8.13. **D5 complete** — next is **D6** (`ItemPool.scan()` → async search → the
  Optimize tab; first user-visible in-game payoff).
- **Addon v0.8.14 — in-game optimizer, D6: Optimize tab (first user-visible payoff — needs in-game
  verification).** Wired the whole ported engine to a UI. New **Optimize** tab in `UI.lua`: an Optimize
  button scans owned gear (`ItemPool.scan()` → the same `engine/Items` objects `Runner` consumes),
  auto-detects the player's **professions** (`GetProfessions`/`GetProfessionInfo` → our perk names) and
  **faction** (`Enchants.detectFaction` off the worn shoulder inscription), then runs
  `ns.Async.optimizeSets` (Kings+MotW buffs) across frames — a live "Solving N/M…" status off the
  `onProgress` hook, then renders the four goal sets as compact cards (name + gate chip, SP / Uncrush% /
  Crit%, EHP / HP / Avoid / Block). Re-clicking cancels the prior run. All glue over code the parity
  harnesses already prove (the item shape flows `ItemPool` → `Runner` unchanged), so the engine result
  matches the website for the same gear/options; the UI layer itself is native-frame glue that compiles
  clean (30-file syntax pass) but is **not yet eyeballed in-game**. `.toc` → 0.8.14. **Phase D optimizer
  is feature-complete pending the in-game smoke test** (open bank, `/tgs`, Optimize — confirm the scan
  sees the same gear as the export and a solve completes without a client hitch). Follow-ups: per-slot
  gem/enchant/alternative detail in the cards, and an options row (keep-mode / phase / manual professions).
  **Status: committed but not yet verified in-game — the user will run the smoke test next session.**
- **Addon v0.8.15 — fix: Export copy box rendered blank (`/tgs export`).** The multiline `EditBox`
  child of the Export tab's `ScrollFrame` had no height set, so on the `_anniversary_` client it
  rendered **blank even though the text was correctly set** (the export string still reached
  SavedVariables fine — which is why we'd been reading it off disk rather than the box). This is a
  regression of the **v0.5.0** fix (`d4d7cce`), which had given the box an explicit height; the
  v0.8.0 WeakAura/tab rewrite of `UI.lua` kept the show-before-`SetText` ordering but dropped the
  `SetHeight`. Restored it: the box gets a non-zero default height at build, and a new `setExportText`
  helper grows the `EditBox` to its line count on every fill (so the scrollbar now reaches the whole
  200-item export, not a fixed window). Both fill paths — the Export tab (`refreshExport`) and
  `/tgs debug` (`UI.ShowDebug`) — route through it. 30-file syntax pass + 8 Lua parity harnesses green.
- **Addon v0.8.4 — in-game optimizer, D1: scoring core (internal, no UI yet).** First brick of porting
  the website's optimizer in-game (plan `snappy-forging-knuth`, Phase D). `bin/gen-lua-data.mjs` now
  also generates **`engine/Weights.lua`** — the stat-weight scales (`ZERO`/`SCALES`/`PARTS`) from
  `src/weights.js` — so the scales stay single-sourced in JS. Hand-ported **`engine/Scoring.lua`**
  (`score`, `scoreByScale`, `contributions`, `blendScale`) mirrors `src/scoring.js` + `weights.js:blendScale`.
  Anti-drift: `bin/gen-scoring-fixtures.mjs` emits JS goldens (score of representative stat blocks ×
  every scale, `blendScale` tables, and blend-then-score end-to-end) to `test/lua/scoring_fixtures.lua`;
  `test/lua/scoring_parity.lua` checks the Lua port against them. Pre-commit drift guard extended to
  regenerate `Weights.lua` (on `src/weights.js` changes) and the scoring goldens. These files load in
  the `.toc` but aren't wired to any UI yet — they're the foundation the D2+ forward-model / search
  sub-phases score through. JS suite still 149/149.
- **Web UI — Locked trinkets promoted out of Advanced; "change the options" nudge under each set.**
  Two discoverability fixes. (1) The **Locked trinkets** control moved from the collapsed *Advanced
  settings* `<details>` into the always-visible **Setup** grid (next to Professions / Stat buff) —
  it's not really optional (procs/on-use trinkets the model can't score are *forced in*, so getting
  the right ones matters for most characters), so it shouldn't be hidden by default. Selects are
  referenced by `id`, so the move is DOM-only. (2) Added a prominent **callout box** under the
  displayed set — a bordered, accent-tinted panel with a bold "Not what you expected?" headline and a
  button-style "⚙ **Change the options ↑**" CTA — that opens the Advanced `<details>` and scrolls up to
  it, so people who don't like a result can find the knobs (phase / keep-gems / scrolls / talents).
  New `.set-foot` / `.set-foot-text` / `.adv-link` / `.set-foot-sub` styles. No engine change; JS suite 149/149.
- **Web UI — no trinkets locked by default; the player picks them right after loading gear.** Loading
  your OWN gear (paste or file upload) no longer pre-locks `DEFAULT_TRINKET_LOCKS` (Icon of the Silver
  Crescent + Eye of Magtheridon) — a wrong auto-guess silently forced trinkets you might not own/want
  into every set. Now both lock dropdowns start at *— none —*, and a successful paste/upload scrolls to
  the top of the **Setup** box and **flashes** the Locked-trinkets field (`promptTrinketChoice`) so
  choosing them is the obvious next step before you hit Optimize (upload no longer auto-optimizes for
  this reason; paste never did). `populateTrinketLocks(applyDefaults=false)` gates the old behaviour:
  only the **sample character** passes `true`, so the demo still shows Icon + Eye locked. Share-link
  restore is unaffected (it re-applies the saved locks after parse). New `.field.flash` keyframe;
  helper copy updated. No engine change; JS suite 149/149.
- **Fix (engine) — "re-gem everything" dropped a shield's block value / Addon v0.8.16.** A user's
  "re-gem everything" threat set came out worse than their equipped gear. Traced it: re-optimizing gems
  rebuilds each item from its `baseStats` (WoW's `GetItemStats`), which — like shield *armor*, already
  backfilled — **omits a shield's innate block value** (it isn't in the stats table). So re-gemming a
  shield silently lost ~150 block value (the repro showed block value **9 vs 277** vs keep-mode), while
  keep-mode preserved it via the tooltip-scanned `resolved` stats. Fixed by backfilling
  `baseStats.blockValue` from `resolved` when base lacks it (the shield case), mirroring the armor guard
  — in both `src/import.js` (website) and `engine/Items.lua` (in-game optimizer). Added a JS regression
  test + regenerated `items_fixtures.lua`. JS 150/150; 8 Lua harnesses green. (A *further* ~35-SP gap
  after this fix turned out to be a real search-suboptimality — fixed next in v0.8.17.)
- **Fix (engine) — pairwise gate-stat relocation recovers stuck threat / Addon v0.8.17.** Follow-up to
  the block-value fix: "re-gem everything" still under-delivered ~35 SP vs the player's manual gems, all
  on one slot. The re-gem set sat >1% **over** the crush cap yet kept a defensive leg gemming (Nethercleft
  Leg Armor + a +8-defense gem) because that gem was *load-bearing* for a razor-thin crit-immunity margin
  (5.70% vs the 5.6% floor) — flipping legs to the +35-SP *Runic Spellthread* alone made the set crittable,
  so the existing greedy one-piece "reclaim the overshoot" pass couldn't free it. Added a **pairwise (2-opt)
  relocation** after the greedy reclaim: flip a def piece TO threat AND a threat piece TO def, relocating
  the gate stat to a slot where threat is worth less — kept only if the set stays legal AND the goal
  objective (`score(agg._raw)`) strictly rises, so it's **monotonic** (can never worsen the set). On the
  reported gear it recovered **+35 SP** (747→782) and gave legs Runic Spellthread with crit landing exactly
  at the 5.6% floor. Mirrored in `src/runner.js` + `engine/Runner.lua`; regenerated `runner_fixtures.lua`;
  JS 150/150, all 8 Lua parity harnesses green (JS==Lua), full 4-set solve ~95 ms. A residual ~24-SP gap to
  keep-mode remains (deeper heuristic-search limit — keep retains more socket bonuses); tracked, not a gate.
- **Fix (engine) — unique/epic gem placement / Addon v0.8.18.** Chasing the residual re-gem↔keep gap:
  the per-socket bulk picker only uses *repeatable* (rare) cuts, so a unique/epic gem (one per character —
  e.g. Runed Ornate Ruby, +12 SP) was excluded entirely (a documented `gems.js` TODO). The player can slot
  one of each, though. Added a greedy placement pass after the meta pass: for each unique (best-first),
  find the focus socket that most raises the objective, re-gemming the whole set per trial via a new
  `gemSet` unique-override arg (so socket bonuses + meta activation recompute), keeping a placement only
  if the set stays legal AND `score(agg._raw)` strictly rises — **monotonic**, each unique used once, each
  socket once. A cheap gem-level gain pre-check bounds the trials. On the reported gear: **+8 SP** (782→790),
  placing Runed Ornate Ruby / Glowing Tanzanite / Vivid Chrysoprase. (Honest note: an earlier "~24 SP"
  estimate was a bad ceiling — it double-counted duplicate uniques; the legal one-each value is ~8 SP.)
  Mirrored in `src/runner.js` + `engine/Runner.lua`; regenerated `runner_fixtures.lua`; JS 150/150, all 8
  Lua harnesses green (JS==Lua), 4-set solve ~104 ms. Remaining ~16-SP gap is socket-bonus allocation
  (keep earns e.g. a chest +4-def bonus with gems that are also high-threat — locking only the chest
  recovers 13 of the 16 SP). Diagnosed but **deliberately deferred**: closing it needs a large gemming-core
  refactor (bonus-chase + re-runnable gate-conversion, mirrored in Lua) for ~1.6% on one set — poor
  risk/reward now that re-gem sits within 2% of keep. Tracked in SESSION_LOG as a TODO.
- **Fix (addon) — Export copy box STILL rendered blank; restored the full v0.5.0 sequence / Addon v0.8.19.**
  The v0.8.15 "fix" (explicit `SetHeight`) was incomplete and never eyeballed in-game — the box was still
  blank. The original working v0.5.0 fix (`d4d7cce`) had TWO parts, and the v0.8.0 tab rewrite dropped the
  second: on the `_anniversary_` client an `EditBox` child of a `ScrollFrame` only renders once it's given
  a non-zero height **AND** is `SetFocus()`'d + `HighlightText()`'d **after the frame is shown**. `setExportText`
  now does all of it (both callers — the Export tab and `/tgs debug` — already show the window + pane first),
  which also auto-selects the text so it's ready for Ctrl+C. 30-file Lua syntax pass clean. Also re-synced the
  full installed addon folder — a user addon-update had reverted `engine/Items.lua` + `engine/Runner.lua` to
  older copies (so earlier in-game tests were partly on stale engine code); installed == repo again.
- **Fix (addon) — self-diagnosing Export box + deterministic zip so the site download is never stale / v0.8.20.**
  In-game the Export box was *still* blank while `/tgs debug` (same `setExportText`) rendered fine — proof the
  failure is in the export path, not the EditBox. Root cause of the *staleness*: the site's "Download the addon"
  link serves the **committed** `addon/TankadinGearSim.zip` (GitHub Pages, static), which was last committed at
  **v0.8.14** — every local rebuild since was never committed/deployed, so the user kept installing old files.
  Two fixes: (1) **`refreshExport` is now self-diagnosing** — instead of silently returning blank when
  `ns.Exporter` is missing or `Exporter.run()` errors, it writes the reason (incl. the Lua error text) INTO the
  box, so the cause is visible without BugSack. (2) **`bin/build-addon-zip.mjs`** — a pure-Node, *deterministic*
  ZIP builder (fixed timestamps, sorted entries, LF-normalized text) — plus `npm run build-addon`, a **pre-commit
  hook block** that rebuilds+stages the zip whenever addon source is committed, a **CI guard** that fails if the
  committed zip is stale (`git diff --exit-code`), and `*.zip binary` in `.gitattributes`. The committed zip now
  always matches the addon source (or CI/commit fails). JS 150/150; 30-file Lua syntax pass; zip byte-reproducible.
- **Upload-only: dropped the copy-paste box entirely (addon + site) / Addon v0.8.21.** In-game the full
  ~200-item / ~40KB export won't render OR copy from a WoW EditBox (Ctrl+A/Ctrl+C came back empty) — a hard
  client limit on that much text. Rather than keep fighting it, the copy box is gone: **the addon Export tab**
  now just runs the export (writes SavedVariables) and shows upload instructions (type `/reload`, then upload
  the `.lua`), with the window shrunk (470×260) and `/tgs debug` repurposed to print to chat + show its (small)
  lines in the pane. **The website** drops the paste `<textarea>` — upload the SavedVariables `.lua` is the only
  path. `app.js` now keeps the raw export in a module variable (`exportRaw`) instead of the DOM field; the paste/
  input listeners are gone; dead `textarea` CSS removed; taglines/how-to reworded to "upload". JS 150/150;
  30-file Lua syntax pass. (The `.lua` upload always worked and is unaffected by the EditBox limit.)
- **Addon v0.8.22 — resizable frame, no text overlap, ItemRack-style minimap button.** Three UI asks.
  (1) **Resize:** a bottom-right grip (`StartSizing`) resizes the window freely in both dimensions; the
  chosen size persists in a new `TankadinGearSimUI` SavedVariable and is reused across tabs. (2) **No
  overlap:** the Optimize tab's four goal cards used to collide when a long line (e.g. the AOE focus text)
  wrapped — now they span the frame width and `SetWordWrap(false)` (long lines clip instead of wrapping),
  and each tab enforces a **minimum size** (`SetMinResize`/`SetResizeBounds`) big enough that its text
  can't be squeezed into overlap. (3) **Minimap button** (`Minimap.lua`): left-click opens a flyout of the
  optimizer's last sets, mousing over a set shows its full per-slot contents (like ItemRack), and clicking
  equips it best-effort (`EquipItemByName` per slot; skips bank items / blocks in combat); right-click opens
  the Optimize tab; drag repositions it round the minimap. Sets are stashed in `TankadinGearSimUI.sets`, so
  the button survives `/reload`. 31-file Lua syntax pass.
- **Web — guided step arrow through the flow.** An animated left arrow (`setStep` in `app.js`, `.step-active`
  CSS) marks the panel to act on next: **1 · Your gear** → **2 · Setup** (the moment a `.lua` is uploaded) →
  **3 · results** (after Optimize); the active panel also gets an accent border. Purely a cue — every panel
  stays usable. Respects `prefers-reduced-motion`. (Trinket note: the own-gear upload path already locks no
  trinket by default — only the sample pre-locks Icon + Eye; verified.) JS 150/150.
- **Addon v0.8.23 — equip-set pulls banked pieces into bags first.** Clicking a set on the minimap flyout
  now, for any piece not already in your bags, locates it in the bank (readable only while the bank window
  is open) and moves it to a free bag slot (`PickupContainerItem` bank→bag), waits a tick, then equips
  everything (`EquipItemByName`). Reports how many it pulled, and — if the bank's closed or bags are full —
  which pieces it couldn't reach. (Confirmed by user: equip + the resize grip work.) 31-file Lua syntax pass.
- **Addon v0.8.24 — "Keep my equipped trinkets" toggle in the Optimize tab.** The in-game optimizer was
  silently forcing the engine's hardcoded `DEFAULT_TRINKET_LOCKS` (Icon of the Silver Crescent + Eye of
  Magtheridon), since `UI.Optimize` never passed its own — so anyone using different proc/on-use trinkets
  got them swapped out (the model can't score procs/on-use). Added a checkbox (default on): when checked it
  passes `trinketLocks = { icon = eq1, eye = eq2 }` from your two **equipped** trinkets (icon kept in every
  set, eye in every set but Survival); unchecked passes `{}` so the optimizer picks trinkets freely. Cards
  shifted down for the new row; Optimize min height 432→458. Likely also narrows the "optimized set vs
  in-game stats" gap the user hit (the set now keeps your actual trinkets). 31-file Lua syntax pass.
- **Addon v0.8.25 — in-game optimizer keeps your completed gems/enchants (no re-gem) + "more options on the
  site" note.** The addon was re-gemming every set (its default), so its numbers assumed gems you hadn't
  applied — hence the "sim says X, in-game says Y" gap. `UI.Optimize` now passes
  `keepGemsEnchants = { itemIds = <all owned ids>, ignoreCompleteness = true }` — "keep every item's gems/
  enchants exactly as-is, even empty sockets" (the engine has no plain "keep everything" flag, but all-ids
  does it) — so the sets keep your existing gems/enchants and the numbers match what you'll actually have on
  equip. The Optimize footer now reads that it keeps your gems, and points to the full sim
  (`npc6388.github.io/Lollerskates-Tankadin-Gear-Sim`) for the options the addon doesn't expose — re-gem
  everything, content phase, and the goal sliders. 31-file Lua syntax pass.
- **Addon v0.8.26 — the footer's sim URL is now click-to-copy.** The Optimize footer showed the full sim's
  web address as a plain FontString, which can't be selected or Ctrl+C'd in-game (the same WoW EditBox/text
  limit that killed the export copy box). A transparent button now overlays the footer: clicking it pops a
  `StaticPopup` (`TGS_COPY_URL`) with the URL pre-selected and focused, ready for Ctrl+C to paste into a
  browser (WoW can't launch one from an addon). Hover shows a "click to copy" tooltip. 31-file Lua syntax pass.
- **Addon v0.8.27 — Kings + MotW assumption is now visible AND toggleable (closes the "sim-vs-addon set"
  confusion).** Root cause of the mismatch a user hit comparing site-built sets to the addon's: the
  optimizer *already* assumes raid buffs (`buff = "raid"` → Kings + MotW, same as the site's default), but
  the **Live readout** reads your actual in-game sheet, which only reflects buffs physically on you. So a
  threat set built to be uncrushable *when raid-buffed* read as crushable (102.09% < 102.4%) while standing
  in town — it wasn't broken, the panel just wasn't crediting the buffs. Two additions:
  - **Live tab — "Assume Kings + MotW" checkbox** (default on, mirrors "Assume Holy Shield up"). `Core.readSheet`
    gained an `assumeBuffs` opt that models the missing buffs the same way the engine does: detects which of
    Kings / MotW are already live (never double-counts), reads effective agility/stamina/strength
    (`UnitStat`), and applies Kings (+10% after flats) + MotW (+14 each) to the derived sheet values the
    buffs actually move — agility → dodge (+ armor), stamina → health, strength → block value. Crit immunity
    is deliberately untouched (buffs add no defense/resilience). A fully-unbuffed prot pally gains ~+1.06%
    dodge / ~+1030 HP; already-buffed → zero change. `talentRank`/`liveStaminaMult` read the live stamina
    multiplier (Sacred Duty/Combat Expertise) so the +14 stamina scales exactly like the sheet.
  - **Optimize tab — "Optimize with Kings + MotW (raid buffs)" checkbox** (default on). Off passes
    `buff = "none"`, so the sets must reach the crush cap from gear alone (tankier, slightly less spell power).
  - `.toc` → 0.8.27. JS 150/150, Lua wasm parity + 31-file syntax pass.
- **Addon v0.8.28 — per-goal EHP↔Threat tuning sliders in the Optimize tab (closes the "addon is tankier
  than the site" gap).** Diagnosed while a user compared site-built sets to the addon's: the addon hardcoded
  the goal ratios (raid `ehp:1 threat:2`, survival `2:1`, aoe `1:2`) while the **site defaults its sliders
  more threat-leaning** (raid v=3 → `ehp:1 threat:4`, survival v=−0.5 → `1.5:1`, aoe v=3 → `1:4`). So the
  addon's out-of-the-box sets were systematically tankier / lower spell-power than the site's — which is what
  the user was seeing. Now the addon exposes the same knob:
  - Four sliders (one per goal) in the Optimize tab, value `v ∈ [−3,3]` step 0.5, using the **same
    `ratioFor` math as `web/app.js`** (`Lw = v<0?1−v:1`, `Rw = v>0?1+v:1`). Drag right → more spell power /
    spell hit; left → more stamina/armor EHP. A live "EHP x : y Threat" readout sits beside each.
  - **Defaults match the site exactly** (raid 3, survival −0.5, aoe 3, balanced 0) so the addon's default
    sets now agree with the site's, and the site's Min-HP floors (11.5k/14k/10.5k, balanced ~12.75k) are
    passed as hard `gates.minHealth` so leaning threat can't quietly drop below a safe HP wall.
  - `UI.Optimize` builds the four goals by cloning `Runner.GOAL_PRESETS` (keeps name/gates/lockEye) and
    overriding `ratio` + `minHealth` from the sliders, then passes them via `optimizeSets`'s `goals` option
    (engine already supported this). Slider creation is `pcall`-guarded so a template hiccup can't break the
    tab. Optimize min height 478→582; footer reworded (goal tuning is now in-addon; re-gem/phase stay
    site-only). `.toc` → 0.8.28. JS 150/150, Lua wasm parity + 31-file syntax pass (runner_parity has a known
    nondeterministic tie-break flake in per-slot alternatives, unrelated to this change).
- **Addon v0.8.29 + site — slider polish: Min-HP sliders, ◂/▸ nudge buttons, a Spell-hit readout, preferred
  defaults.** Round of refinements after the sliders landed:
  - **Live tab — "Spell hit" row** under "Spell power" (`Core.readSheet` now returns `spellHitPct` = Precision
    talent + gear spell-hit rating / 12.62, via a gear scan mirroring the resilience one; shown as `x% / 17%`
    against the level-73 cap). Live min height 404→420.
  - **Optimize tab — Min-HP sliders exposed** (were hidden gates). Each goal row now carries BOTH an
    EHP↔Threat slider and a Min-HP slider (10k–20k, 500 step), each flanked by **◂ / ▸ nudge buttons** (small
    buttons that step the slider, dim→gold on hover — the addon analogue of the site's end-buttons). Ratio
    readout compacted to `L:R` to fit both sliders on one row. `UI.goalMinHP` state drives `gates.minHealth`.
  - **Preferred defaults** (the user's validated slider stops): raid `1:4`, aoe `1:4`, **survival `1:1`**
    (was 1.5:1), **balanced `1:1.5`** (was 1:1). Min-HP defaults 11.5k / 14k / 10.5k / 12.5k.
  - **Site — Min-HP buttons restyled** to match the EHP/Threat end-buttons (same pill background/border/hover)
    and given **◂ / ▸ arrows** via CSS `::before`/`::after` pseudo-content (so the JS value-updates never wipe
    them). CSS-only change in `web/style.css`.
  - `.toc` → 0.8.29. JS 150/150, Lua wasm parity + 31-file syntax pass all green.
- **Addon v0.8.30 — the slider labels ARE the nudge buttons; balanced default → 1:1.** Followed the site's
  pattern more faithfully: instead of separate tiny ◂/▸ buttons, the flanking **labels themselves are the
  clickable nudge buttons** — "◂ Raid" (left, nudges toward EHP) and "1:4 ▸" (right, the live readout, nudges
  toward Threat); likewise "◂ HP" / "12.5k ▸" for Min-HP. New `textBtn` helper (base colour, white on hover);
  `tuneSlider` reworked around it. Also corrected the **balanced default to 1:1** (v=0, was 1:1.5) per the
  user. Site slider defaults left unchanged (its Balanced is a cross-goal blend dial, not an independent
  ratio). `.toc` → 0.8.30. JS 150/150, Lua wasm parity + 31-file syntax pass.
- **Addon v0.8.31 — tuning rows relaid out per the user's mockup; dropped the box-glyph arrows.** In-game the
  ◂/▸ arrows rendered as empty boxes (WoW's default font lacks those glyphs) and the one-line rows were
  cramped (goal names truncated to "Su.."). Reworked to a **two-line block per goal**: the full goal name on
  its own line ("Raid Threat", "Survival", "AOE Trash", "Balanced"), then a **"threat" slider** (EHP↔Threat
  lean, readout e.g. `1:4`) and an **"hp min" slider** (floor, e.g. `11.5k`) beneath it. The flanking labels
  stay click-to-nudge (dim, white on hover) — just no arrow glyphs. Optimize min height 582→668.
  `.toc` → 0.8.31. JS 150/150, Lua wasm parity + 31-file syntax pass.
- **Addon v0.8.32 — labels above the slider + real arrow-texture nudge buttons.** Per the user: moved each
  slider's label ("threat" / "hp min") and live value ("1:4" / "11.5k") to the line **above** the slider, and
  replaced the click-to-nudge text labels with proper **◄ / ► buttons** flanking the slider — using WoW's
  built-in spellbook page-turn arrow textures (`UI-SpellbookIcon-Prev/NextPage`), so no font-dependent glyphs.
  Layout per goal: goal name + both sliders' label/value on the top line, the two arrow-flanked sliders below.
  Dragging still works; the arrows step by the slider's increment. `.toc` → 0.8.32. JS 150/150, Lua wasm
  parity + 31-file syntax pass.
- **Addon v0.8.33 — tuning rows relaid out to the user's mockup (3-part labels).** Each goal is now three
  lines: the **goal name** on its own line, then two labelled sliders below — the threat slider reads
  **`EHP` | `<ratio>` | `Threat`** (left axis, centred live value, right axis) and the floor slider reads
  **`off` | `<hp>` | `20k`** — each flanked by the ◄ / ► arrow buttons. The three label parts share the
  slider's width box (left/centre/right justify) so they never collide. Optimize min height 668→726 (cards
  shifted for the taller rows). `.toc` → 0.8.33. JS 150/150, Lua wasm parity + 31-file syntax pass.
- **Addon v0.8.34 — tuning + result-card polish.** (1) The centred slider value now anchors to the slider's
  centre (and the axis labels to its edges), so the ratio reads centred between `EHP` and `Threat`.
  (2) The tuning header wraps before "& Min-HP floor". (3) Result cards drop the redundant "legal" word
  (the ✓ already says it; failures still show "illegal" / "HP unreachable"). (4) The cards' EHP line is
  relabelled **`EHP/HP`** since it shows both (`EHP/HP 32406 / 12831`). Optimize min height 726→744.
  `.toc` → 0.8.34. JS 150/150, Lua wasm parity + 31-file syntax pass.
- **Addon v0.8.35 — minimap set icons + `SP/SH` on cards.** The minimap flyout's per-set status dot was a
  `●` font glyph that rendered as an empty box (same font-glyph issue as the arrows). Replaced it: each set
  row now shows a **thematic ability icon** — Raid Threat = Righteous Fury, Survival = Devotion Aura, AOE
  Trash = Cleave, Balanced = Seal of Justice (alternatives listed in `SET_ICON`'s comment for easy swaps) —
  plus a ready-check ✓/✗ texture for legal/illegal (renders reliably). Also relabelled the result cards'
  spell-power line **`SP/SH`** with the set's spell-hit % (e.g. `SP/SH 752 / 9.18%`), mirroring the Live
  readout. Also this version: **ratio value truly centred** (anchored to span the gap *between* the EHP and
  Threat labels with centre justify, so a wider "Threat" no longer pushes it off-centre) and **min-size
  fixes** — Live 420→448 (the Spell-hit row + note were overlapping) and Optimize 744→668 (it couldn't shrink
  to the content). `.toc` → 0.8.35. JS 150/150, Lua wasm parity + 31-file syntax pass.

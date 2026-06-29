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

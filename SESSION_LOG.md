# Session Log

Running handoff notes for resuming work. Newest session at the top.

---

## 2026-06-27 — Gate-aware socket bonuses (fresh TGS scan pass)

**Trigger:** on a fresh scan (`scratchpad/export-current.txt`), the player noticed the **raid
threat 1:4** set forfeited the **shoulder** (+4 stam) and **chest** (+4 defense) socket bonuses,
and tied the lost chest *defense* to the set being crushable even with Kings + MotW.

### Diagnosis (reproduced)
Both forfeits are the **blue** socket: the best threat gem is **Veiled Noble Topaz** (orange =
red+yellow), which doesn't fit blue. `planItemGems`' worth-it test (option A all-best-gem vs B
match-for-bonus) scored only on the goal weights; at 1:4 the blue-socket downgrade orange→purple
(Glowing Nightseye) costs ~11.6 obj pts while +4 def is worth only ~4.4 — so it forfeits. Correct
for *threat*, but the chest's +4 **defense** is avoidance that feeds the **uncrushable gate**, which
the threat scale prices at ~0. On this scan the set still clears the cap (≈102.95% / 102.4%), so it
sat right on the cliff; on the player's tighter config that forfeit tips it crushable. (Shoulder +4
*stam* is not a gate stat — that forfeit is genuinely threat-optimal.)

### Shipped (this commit)
- **Gate-aware worth-it test.** `planItemGems` gains a `gateScale` opt + exported `GATE_STATS`
  (defense/dodge/parry/block/resil/agility). When a piece's socket bonus is a gate stat and
  `gateScale` is given, the A/B decision is priced on the **cap scale**, so the cheap avoidance
  bonus (and the gems that earn it) win.
- **Runner gate recovery.** `runner.js` re-gems gate-aware whenever the socket-bonus-aware set comes
  up **crushable**, keeps it if avoidance rose, and leaves the flag **on through the reclaim pass**
  so reclaim (which re-gems threat) can't silently undo it.
- **Free bonus on a tie.** Worth-it tie-break `>` → `>=`: if the gems you'd slot anyway already match
  the sockets, the bonus is free, so bank it instead of forfeiting (per the player's follow-up).
- Tests: +2 in `gemsolver.test.js` (gate-aware keeps a defense bonus a threat set forfeits; free
  bonus banked when the best gem already fits). Full suite **103 pass**.

### Caveat / pick up here
On THIS scan no ratio ships a crushable set (the optimizer's def-gem variant search already
over-satisfies the cap to ~102.95%), so the runner gate-recovery path is a **safety net** validated
by unit test, not yet by an end-to-end crushable scan. If the player still sees crushable, get that
exact config (professions / phase / trinket locks) to repro the integration path directly.

### Backlog (player request — do AFTER the current config pass)
- **"Keep existing gems/enchants" option.** A toggle to build sets WITHOUT re-gemming/re-enchanting —
  treat each item's currently-socketed gems + applied enchant as **fixed** (score off resolved
  `item.stats`, skip `planItemGems`/`bestEnchant` for locked items). Two motivations: (1) **budget**
  players who can't afford to re-cut gems / buy enchants per set, and (2) when the **same physical
  item is shared across multiple sets**, you can't realistically re-gem/re-enchant it each swap, so
  its gems must stay put. Probably wants per-item granularity (lock some, optimize others) and a
  global "lock all current" default. Note the existing groundwork: the addon already folds worn-gem
  stats into resolved `item.stats`, and the gem layer already builds from `baseStats` to avoid
  double-counting — so a locked item just uses resolved stats and is excluded from the gem/enchant
  solver.

---

## 2026-06-26 — Threat-set tuning: buff stacking, spell crit, Veiled/Ornate gems

**Goal:** close the gap where the player's hand-built single-target threat set beat the sim's
max-threat output. Diagnosed against the player's TGS11 export + their sixtyupgrades set JSON.

### Diagnosis
- Item *selection* is already 2-opt optimal (a pairwise-swap climb found no improvement), so the
  gap was **objective/weights + gemming**, not search depth.
- Root causes: (1) **Kings + MotW were modeled as mutually exclusive** — they STACK (flat +
  percentage); player confirmed. (2) **Spell crit was unscored** (`spellCritRating` wasn't even in
  `STAT_KEYS`). (3) **Gem DB missing** `Veiled Noble Topaz` (5 dmg/4 hit) and `Runed Ornate Ruby`
  (+12, unique) — the player's actual gems.

### Shipped (this commit)
- **Buff stacking** — `runner.js` `BUFF_MODE` now has a `raid` mode (Kings + MotW together); it's
  the default for `buffed`/CLI/UI. The model already layered them correctly; only the mode picker
  was wrong. `index.html` dropdown + note updated.
- **Spell crit scored** — `spellCritRating` added to `STAT_KEYS`, the `ZERO` weight template, the
  threat `PARTS` (0.3) / `aoeThreat` (0.4) and named threat `SCALES` (0.45–0.7) and `balanced`
  (0.3); calibrated from a crit's +0.5× damage. `aggregate` surfaces it; CLI prints it. Crit stats
  added to the Potent gems + the two inscriptions that carry it.
- **Gems** — added `Veiled Noble Topaz` (player-confirmed 5 dmg/4 hit) and `Runed Ornate Ruby`
  (+12 spell dmg, **`unique: true`**). `bestGem` skips `unique` gems for bulk fill (workhorse stays
  Runed Living Ruby) — Ornate's real value is only +3 SP in one socket.

**Result:** the sim's Raid Threat set now independently reproduces the player's Veiled-gemmed,
high-hit, crit-carrying build — 791 SP / 8.31% hit / 33 crit-rtg vs the player's 801 / 8.63% / 38,
trading a little SP/hit for more stamina (the EHP component). Tests **99/99**.

### Follow-on (same session)
- **Import name-parsing bug fixed.** The addon's optional `socketBonus` field is sometimes omitted
  (`…|base|name`) rather than empty (`…|base||name`); the fixed-index parse put the name in the
  bonus slot and dropped it — every trinket showed an ID in the lock dropdown. `import.js` now
  resolves trailing fields by shape. Verified: 0 items missing names on the live export.
- **Model reconciled** to the player's sheet + Sixty export: hit 8.63% / crit 38rtg match exactly,
  SP/str/agi/int exact, stamina within ±rounding. The engine is trustworthy end to end.

- **Meta activation fixed for threat.** The threat set's meta wasn't activating (only spell-dmg
  meta was Imbued, "more red than blue", fragile + behind a toggle). Added **Ember Skyfire Diamond**
  (+14 spell dmg, 3+ red) — robustly active on a red/orange threat set. Also corrected Eternal
  (`2+ blue, 1+ yellow`) and Relentless (`2+ red, 2+ yellow, 2+ blue`); `metaActivated` now parses
  comma-AND clauses. Verified: full-threat meta = Ember, active, with the Imbued toggle on OR off.
  - **NOTE / follow-up:** the player's client shows different meta item IDs than the DB (screens:
    Ember 46601, Eternal 46597, Powerful 32866, Relentless 39961) vs DB classic IDs (35503/35501/
    25896/32409). Math is unaffected (DB is a recommendation pool), but Wowhead links may point at
    the classic cut. Revisit if we start matching owned gems by ID.

### Shipped (later in session)
- **Reclaim the gate overshoot (the big one).** Root-caused the "def gem on a max-threat piece"
  complaint: the optimizer selects cap/def-gem variants from APPROXIMATE stats, but the final
  socket-bonus-aware set clears the gates without them and sits several % over the uncrush cap.
  `runGoal` now runs a reclaim pass on the true final stats — flips def-gemmed pieces back to threat
  gems greedily, keeping any flip that stays legal. Max-threat: uncrush 105.2% → 102.7%, +27 SP,
  neck back to Veiled; only a genuinely load-bearing def-gem remains. Factored final gemming into a
  reusable `gemSet(scaleOf)` + `finalLegal(evald)` helper.
- **Ember Skyfire is PHASE 5** (player), so it's gated out now; current-phase threat meta is Imbued
  ("more red than blue", active on an all-red/orange set). Compound meta requirements corrected
  (Eternal 2blue+1yellow, Relentless 2red+2yellow+2blue) so dead metas are never recommended.
- **Min-HP gate per set.** Hard raid-buffed-HP floor on every goal (incl. AOE), enforced like
  uncrit/uncrush. `optimizer.js` gates + `gateDeficit` (HP shortfall ÷1000 to match %-unit
  deficits), `character.js` surfaces `health`, web UI adds a 10k–14k/500 slider + gate chip.
  Verified: gate binds (raises HP, trades SP) or marks the set illegal when unreachable. Test added.
- **Neck gem confirmed** (Pendant of Dominance → Veiled, earns the +2 spell-crit socket bonus).

- **Epic gems are unique (realm rule).** Player confirmed every epic cut is one-per-character.
  `bestGem` excludes `epic` (and `unique`) gems from bulk → falls back to the near-identical rare
  cut (Tanzanite→Nightseye, Chrysoprase→Talasite, Fire Opal→Dawnstone). Impact <1% across sets.
  `allowUnique` opt-in left as the hook for single-placement.

- **Meta-recolor preserves socket bonuses.** Repro (with the Imbued meta toggle OFF, so the threat
  set falls back to the Powerful 3-blue meta): the recolor turned the helm's yellow socket blue with
  a purple gem (Glowing Nightseye), forfeiting the +4 dodge bonus — player spotted it and suggested
  a green gem (Enduring Talasite). Fix: `bestGem({alsoFits})` + the recolor prefers a dual-color gem
  fitting both the meta color and the socket's own color (yellow→green), keeping the bonus. Verified:
  helm now keeps Veiled / earns the +4 dodge. **Player confirmed this was the fix** — the wrong-color
  helm gem forfeiting the +4 dodge was what pushed them under the crush cap (Imbued was unchecked).
- **Enchants phase-gated** (they weren't). `bestEnchant` skips enchants above `opts.maxPhase`
  (default CURRENT_PHASE), threaded through runner + `recommendEnchants`/`solveLoadout`. **Cloak -
  Steelweave → phase 5** (player), so survival/def now fall back to Cloak - Dodge → then Greater
  Agility (next item).
- **Agility valued a touch above dodge rating** in the EHP-value scales (`PARTS.ehp` 1.05,
  `survivalEHP`/`balanced` 1.10 vs dodge 1.0/1.06): agility gives less dodge per point but also armor
  (2/agi) + melee crit and scales with Kings. Cloak enchant now picks **Greater Agility** over
  Cloak - Dodge. `survivalUncrushable` (def-gemming for the cap) left dodge-ahead on purpose — the
  crush cap is raw-avoidance-per-point, where dodge rating wins.

### Pick up here
1. **Onboarding: simple README + user-friendly on-ramp for testers/users (player request).** Cover
   BOTH halves end to end: (a) the **TGS addon** — install (drop `addon/TankadinGearSim` into
   `Interface/AddOns`), `/tgs` then `/reload`, where the export lands
   (`WTF/.../SavedVariables/TankadinGearSim.lua`) or the copy box; (b) the **gear sim** — open the
   live tool, paste the export (or load the file), pick a goal + move the EHP↔Threat / Min-HP
   sliders, set buff/phase/faction/Imbued toggles, read the gates (uncrit/uncrush/min-HP) + paper
   doll, export back to Sixty Upgrades. Keep it short, screenshots/gifs, "5-minute first run" tone.
   The current top `README.md` is dev/status-flavored — add a clear quick-start up top (or split a
   `docs/` page) aimed at non-devs.
2. **Faction:** player is **Scryer** (uses Greater Inscription of the Orb). CLI/`bin` defaults to
   Aldor → would pick Discipline. Make faction a first-class setting / detect it.
3. **Per-socket gemming** granularity (whole-item focus/cap variants still).
4. **Pure-threat slider** — now LOW impact (Veiled gemming maxes threat regardless; pure-threat SP
   785 < raid 791), so deprioritized vs the soft cap.
5. **Spell-hit soft cap — DEFERRED (player: "a while before I approach the hit cap").** Future work:
   the blended ratio goals value `spellHitRating` at a flat 1.1× with NO cap; past the **17%
   spell-hit cap** it should drop to ~0 (the named `threatSingleAtCap` scale does this; the
   PARTS/blend goals don't switch). Not urgent — player is far below the cap.
6. **Reconciliation TODO:** feed the player's exact set in and confirm the model reproduces
   801 SP / 8.63% hit / 8.98% crit / 11,957 HP end to end.
7. **Single-placement for unique gems — DECLINED (2026-06-26).** Player: "it's fine to leave the
   epics off, anyone with one can just add it to their Sixty Upgrades." Unique/epic gems stay
   excluded entirely; the `bestGem({allowUnique})` hook remains but don't build on it unless asked.

---

## 2026-06-25 — Export box fixed → full-bank run; import + optimizer hardening

**Goal:** get a real export off the live client, then run the full collection.

### Shipped (committed + pushed)
- **`d4d7cce` — Addon v0.5.0.** The `/tgs` copy box rendered blank on the `_anniversary_`
  client (EditBox in a ScrollFrame, focused before shown, no height). Added a **SavedVariables
  dump** (`TankadinGearSimDB`) as the primary path: `/tgs` then `/reload` flushes the full
  export to `WTF/Account/<acct>/SavedVariables/TankadinGearSim.lua`, read straight off disk.
  Also hardened the box (show before SetText/focus, explicit height). `.toc` bumped so the
  AddOns list confirms the loaded version. Export VERSION stays `9` (no wire change).
- **`cf35ab0` — import backfills shield armor.** `GetItemStats` (the `base` field) reports 0
  armor for shields (live: base 0 vs resolved 5727). `parseExport` now copies resolved armor
  into `baseStats` when base lacks it (exact, not a double-count — gems never add armor, TBC
  shields take no armor enchant). Without this, re-gemming from `baseStats` lost ~5.7k armor.
- **`0d30212` — optimizer: paired slots + four ratio goals.** Folded the scratch-harness logic
  in: `buildPool(items,{lock,exclude2H})` expands ring/trinket → ring1/ring2 + trinket1/trinket2
  (with distinct-groups), drops 2H, applies locks. Both solvers enforce distinctness; heuristic
  honors locks. Gates take `uncrushableTarget` (AOE trash may sit ~5% under). Objectives are
  pluggable (`spellPower`/`ehp`/`scale`/fn). `weights.js` `GOAL_SCALES`: raidThreat (threat:sta
  2:1), survival (ehp:threat 2:1), aoeThreat, balanced2 (1:1). Tests 91/91.

### Full-bank run (scratch harness `scratchpad/optimize.mjs`, NOT committed)
Decoded the live export → 212 items / **109 equippable**, all slots. Four goals, UNBUFFED + HS:
Survival EHP 33.9k, Balanced 30.9k/SP646, Raid SP745/uncrush, AOE SP831 @97.4%. All uncrittable.

### Then shipped (committed + pushed) — addressing that feedback
- **`62760b5` — buff model.** `aggregate` takes `opts.kings` (+10% primaries, after flat buffs)
  and `opts.buffs` (MotW flat +14); `BUFFS` exports both. Defaults off (reconcile untouched).
- **`35fb11f` — meta-gem activation.** `metaActivated()`/`gemColors()` (hybrids count for both
  colors); `bestMeta(w,{counts})` only returns an activatable meta; `solveLoadout` tallies the
  set's colors then picks the meta and flags any that can't activate.
- **`f426a1b` — committed runner `bin/optimize.mjs`** (`npm run optimize [export.txt]`). Buffed,
  locks Icon (all) + Eye (non-survival), four goals. **Gemming is a LEVER for the caps**: each
  socketed item enters as a focus variant (goal gems) and a cap variant (avoidance/defense gems),
  so the optimizer keeps a higher-threat item and def-gems IT when that beats a tankier swap
  (triggers on the survival/balanced helm). Final gems socket-bonus-aware via `solveLoadout`.

**Validated:** raid-threat hits **762 SP @ 7.04% spell hit, uncrit+uncrush** — matches the
player's hand-built target (760 SP / 6.73%). Buffed four-set summary:
Raid 762SP, Survival EHP 35.9k, AOE 840SP @97.5%, Balanced 680SP/EHP 33.3k.

### Pick up here
1. **Heuristic selection/final mismatch:** selection uses approximate raw-gem variant stats, the
   final regems via `solveLoadout`; the survival/balanced helm gets def-gemmed even though the
   set finishes ~104.7% uncrush (slight overshoot — could keep ~24 stamina). Tighten by gemming
   during selection or feeding the cap-lever the real socket-bonus-aware stats.
2. **`GOAL_SCALES` sub-weights are first-pass** — tune the ratios/spell-hit weighting now that
   buffed/locked numbers are in (player may want more spell hit vs raw SP).
3. **Tome of Fiery Redemption** swap into the lock list once acquired (replaces Eye of Mag).

---

## 2026-06-24 — Socket-bonus export gap → per-item gemming, cap-aware solver, item names

**Goal of the session:** close the addon socket-bonus export gap (the open M3 item), then
use it to run a real BiS optimization over the player's collection.

### Shipped (committed)
- **`7485458` — Addon v8 + per-item socket-bonus matching.**
  - Addon v8: each item line now `…|<resolved>|<base>|<socketBonus>`. `base` = `GetItemStats`
    on the gem/enchant-**stripped** base link → clean stats + **full socket-color layout**
    (every socket, even filled). `socketBonus` = discrete `ITEM_MOD_*:val`.
  - `import.js` exposes `item.baseStats`, `item.sockets`, `item.socketBonus`.
  - `gemsolver.js` `solveLoadout` now plans gems **per item**: compares (best raw gem, ignore
    color) vs (color-match to earn the bonus) by goal weights, keeps the winner. Gem stats
    added relative to `baseStats` (no double-count).
- **`0959e21` — Cap-aware gem solver.** `gemWeights(weights, { atCapWeights, uncrushable })`:
  once a set is already uncrushable, swap the `survivalUncrushable` premium scale for
  face-value `survivalEHP` so it stops stacking now-worthless avoidance. `solveLoadout`
  auto-detects uncrushable via `aggregate`/`evaluateSet` when `atCapWeights` is passed.
- **`0a4e19a` — Addon v9: item names.** Append the item's display name (`GetItemInfo`) as a
  trailing field; `import.js` exposes `item.name`. No name DB needed for owned gear.

Tests: **82/82** green throughout. Reconcile fixture (`lollerskate-unbuffed.js`) left untouched.

### Verified on the player's live exports
- v8 export confirmed the key unknown: `GetItemStats("item:<id>")` returns the **full socket
  layout even for gemmed items** (chest 29066: base stam 48 vs resolved 90, sockets still
  `{red,yellow,blue}`). Per-item worth-it works (neck forfeits a worthless +2 spell-crit
  bonus, keeps raw stamina; everything with a stam/def/dodge bonus color-matches).
- **Crit immunity:** model adds def + resilience additively (`critReduction(defenseSkill,
  resilienceRating)`), so the player is uncrittable at 468 def + 59 resil (6.25% ≥ 5.6%).

### Optimization run (ad-hoc, via a scratch harness — NOT committed)
Ran two goals over a **partial** bag pool (~37 of ~90 equippable bag items hand-transcribed).
Constraints honored: **Icon of the Silver Crescent (29370) locked** to a trinket slot; 2H
weapons excluded; paired ring/trinket slots + distinctness handled in the harness.
- **Survivability:** reaches **UNCRUSHABLE (108.4%)** — current worn set is only 100.2%. Max
  EHP ~32.2k. Cap-aware gems shifted survival gemming from 143 def / 107 sta → 81 def / 239 sta.
- **Single-target threat:** SP 810 (up from 777), uncrittable via 449 def + **102 resil**
  (leans on resilience to free budget for spell power).

### Pick up here tomorrow
1. **Re-export `TGS9`** (copy `addon/TankadinGearSim` into AddOns, `/reload`, `/tgs`) so the
   readout shows real **item names**. Paste it back → I'll re-run the two-goal optimization
   with names instead of IDs (and can drop the unreliable guessed-name map in the scratch
   harness).
2. **Full-bank run.** This session's run used only a partial pool because the bag items were
   hand-transcribed from the paste. To run the COMPLETE collection, save the export to a file
   (e.g. `scratchpad/export.txt`) so I parse all of it — the manual paste is the bottleneck.

### Known follow-ups / caveats (not yet done)
- **Gem double-count:** `solveLoadout` `addedStats` is relative to base; cap numbers already
  include current gems. A full re-gem readout must build from `baseStats`, not resolved stats.
- **Optimizer paired slots:** ring1/ring2 + trinket1/trinket2 and uniqueness are handled in
  the scratch harness, not in `src/optimizer.js` (still one-item-per-slot, no uniqueness, no
  weapon/offhand 2H exclusivity). Worth folding into the optimizer proper.
- **Item DB (open M3 item):** now only needed for **manual search of UNowned items** — names
  for owned gear are covered by addon v9. Scope shrank accordingly.
- **Minor addon glitch:** a few random-suffix bag items export a mangled token
  (`…RESISTANCE0_NAME=364ESISTANCE0_NAME=364`); parser drops it harmlessly. Cosmetic v9.x fix.

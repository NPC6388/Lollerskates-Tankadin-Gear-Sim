# Session Log

Running handoff notes for resuming work. Newest session at the top.

---

## 2026-06-27 (i) — Weights export: Sixty Upgrades JSON, not Pawn

Player confirmed SU's custom stat-weights format is a flat JSON of `{ ourKey: weight }` using the SAME
keys this sim uses (incl. `metaSockets/redSockets/yellowSockets/blueSockets`), zeros omitted — they
pasted a working single-target scale. The earlier "Copy Pawn string" was my wrong guess.

- `web/app.js`: replaced `pawnString` with `suWeightsJson(key)` = `JSON.stringify` of the scale's
  non-zero entries; button relabeled **Copy weights (JSON)**; on-page table now lists all non-zero
  entries (incl. socket weights AND blockValueBonus — the player's working survival scale confirmed SU
  accepts that key, so nothing is excluded). How-to in `index.html` updated (copy JSON → SU Custom Stat
  Weights); CSS class `.copy-pawn` → `.copy-weights`. Suite **120 pass**.
- The emitted single-target JSON matches the player's working one except it now also includes
  `spellCritRating: 0.45` (added when spell crit became scored). Unverified SU keys to watch:
  `spellCritRating` and the survival-only `health/blockValue/dodgeRating/parryRating/resilienceRating/
  armor` — flagged to the player to confirm SU accepts them (will drop/rename any it rejects).

---

## 2026-06-27 (h) — AOE tuned for trash: no crush gate, low spell hit

Player: the AOE set still held defensive pieces (Aldori shield, Crimson belt, Seventh Ring) because
of the crush gate; for level ≤72 trash there are no crushing blows and only ~5% spell hit is needed.

- **Dropped the uncrushable gate for the AOE Trash goal** (`gates.requireUncrushable: false`; trash
  ≤72 can't crush — only 73+ bosses). Crit immunity kept (trash can crit; set stays uncrittable
  anyway). This is what was holding shield-block/avoidance pieces; removing it flips the 1:4 AOE set
  to pure threat (Merciless Barrier, Veteran's Lamellar Belt, Seer's Signet + Seal of the Exorcist),
  ~+40 SP, avoidance ~89% (fine — not required).
- **Lowered spell-hit weight in the AOE scale** (sim + SU/Pawn): `PARTS.aoeThreat.spellHitRating`
  1.3 → 0.3 and `SCALES.threatAOE.spellHitRating` 2.2 → 0.5 (only ~5% needed vs a level-72 mob).
- Gate readout shows "Uncrushable N% — not required (trash)" for the AOE set (web `.gate.na` + CLI).
- Suite **120 pass**. NOTE: the AOE *preset default* is 1:2 (more EHP-weighted) so it still mixes in
  some survival/socketed pieces; full-threat behavior is at the 1:4 the player uses.

---

## 2026-06-27 (g) — Tooltip-scan capture gap; AOE picks explained

**Trigger:** player questioned AOE picks (Aldori>Merciless, Phoenix-Wing>Sergeant's, Battlescar>Boots
of the Righteous Path, Seventh Ring>Seer's Signet) and showed Girdle of Valorous Deeds' tooltip with a
"+20 spell damage" equip line — suspecting items are mis-read.

**Findings:**
- **Real capture gap.** The addon's tooltip scan (resolved field) dropped "+spell damage" equip lines
  ("Increases damage and healing done by magical spells and effects by up to N") on ≥4 items in the scan
  (Valorous Deeds sp19, Crusader's Ornamented Spaulders sp7, Seal of Danzalar sp24→12, Veteran's
  Lamellar Bracers sp21). `GetItemStats` (base field) captured them. **Fixed:** `import.js` lifts any
  resolved stat below base up to base (resolved ≥ base always holds for innate stats). Fixes keep-mode
  deltas (were going negative) + as-worn eval. Optimizer was already scoring off base, so picks unchanged.
  Regression test added. Suite **120 pass**.
- **Picks were already correct / are gate-driven.** With the current code the AOE 1:4 set picks the
  THREAT items — Merciless Gladiator's Barrier, Sergeant's Heavy Cape, Boots of the Righteous Path —
  NOT the defensive ones the player saw (so they were on an older build; both old single-target-threat
  and new aoeThreat weightings now pick the threat items). The **ring** (Seventh Ring of the Tirisfalen
  over Seer's Signet) is the crush gate: the AOE set sits at 97.78% vs the 97.4% relaxed cap, and
  Seventh Ring's block 24 + defense 17 is needed to stay uncrushable; Seer's Signet (caster, sp33+crit)
  would drop it below. Min HP "11k" wasn't binding (set already ~11.3k).

---

## 2026-06-27 (f) — Libram effect modeling (Consecration libram wins AOE)

**Context:** player asked why AOE picked Libram of Repentance over Libram of the Eternal Rest, and
gave the mechanic: in AOE, Holy Shield charges are consumed early so Repentance's "+42 block while
Holy Shield active" bonus drops, whereas Eternal Rest's +47 Consecration damage keeps benefiting
(Consecration hits every target). Tooltips confirmed: Eternal Rest = +47 Consecration dmg;
Repentance = +42 block rating while Holy Shield active.

**Shipped:**
- `src/librams.js` — models known librams as EFFECTIVE stats (overrides parsed stats, no double-count),
  matched by id or name. Eternal Rest → `consecrationDamage:47`; Repentance → `blockRating:42`.
  `import.js` applies it.
- New modeled stat **`consecrationDamage`** in `STAT_KEYS` + weights — NOT spell power (keeps the
  spell-power reconcile intact). ~0.4/SP-pt single-target, ~2× SP for AOE (per-target). Added to
  `PARTS.threat`/`aoeThreat`, the named threat `SCALES`, and `balanced`.
- **AOE Trash goal now blends `aoeThreat`** (was the single-target `threat` part — previously the AOE
  set differed from raid only by the looser crush gate, so Consecration's AOE value was invisible).
  `runner.js` preset ratio `{ehp:1, aoeThreat:2}`; `web/app.js` slider axis `aoeThreat` ("AOE Threat").
- Verified: AOE → Eternal Rest; raid/survival/balanced → Repentance. Tests `test/librams.test.js`
  (id/name match; AOE>ST Consecration value; per-goal relic split). Suite **119 pass**.

**Note:** weight magnitudes are reasoned approximations, not a derived threat sim.

**Revised same session (player feedback):** the `consecrationDamage` pseudo-stat was dropped — it can't
be expressed in the Sixty Upgrades scales, so weighting it there is invalid. Reworked to convert the
libram's flat damage to **equivalent spell damage** (a real/SU stat): Eternal Rest = ~35 spell damage
(raw coeff inversion ~49, discounted since it only feeds Consecration). Reverted consecrationDamage from
`STAT_KEYS` + all scales/PARTS. Kept the AOE goal on `aoeThreat` (real improvement; weights spell damage
higher). Net on the real scan: AOE → Eternal Rest; raid/survival/balanced → Repentance. Tests updated.
Caveat: a single spell-damage number can't make it AOE-*only* (that needed the per-scenario pseudo-stat);
tune the value in `librams.js`. Also reworded the socket note for the SU flow (gems are exported; you may
need to swap them between sockets in SU if the order wasn't right). Suite **119 pass**.

**Belt question (no code change):** AOE 1:4 picks Crimson Girdle of the Indomitable (gemmed for threat),
not Girdle of Valorous Deeds — the latter is a pure survival belt (int/stam/def/block, zero threat
itemization), so it scores far below the threat belts on the AOE scale and isn't needed to hold the
relaxed crush gate. Working as designed.

---

## 2026-06-27 (e) — Scan completeness: stat-less gear no longer dropped

**Trigger:** player asked why the AOE set uses Libram of Repentance not Libram of (the) Eternal Rest,
then flagged "the scan isn't picking up all my gear."

**Findings:**
- The libram is NOT in the export at all (only one relic line, Repentance id 29388 = blockRating 42).
  The addon exports every item it can read a LINK for (no stat filter), and reads bank contents only
  while the bank window is OPEN — so the most likely cause is the libram was in a CLOSED bank during /tgs.
- **Latent import bug fixed:** `equippableItems` required ≥1 parsed stat, so it silently dropped any
  equip-slot item whose value is a non-stat effect (a threat/Consecration libram, a pure on-use
  trinket). Now it keeps anything with a recognized slot (scored on whatever stats it has). Non-gear
  (shirt/tabard/quest) has no equip slot, still excluded. Tests updated + added (116 pass).

**Still open (told the player):**
- A libram only becomes *available* in the pool — its threat effect isn't MODELED as a stat, so it
  scores ~0 and won't auto-beat Repentance's block for AOE until libram effects are modeled.
- No way to force a specific relic (only trinkets have locks). A relic-lock or libram-effect modeling
  is the next step if they want Eternal Rest actually chosen.
- Possible addon improvement: report item counts by source (equipped/bags/bank) + warn if the bank
  looks closed, so completeness is verifiable. Not done yet (would bump addon to v12).

---

## 2026-06-27 (d) — Sixty Upgrades weights panel + leg-armor lock check

- **SU stat-weights panel** (`index.html` #weights-panel, `web/app.js` renderWeights). Shows the
  guide's named scales (ST threat below/at cap, AOE, survival uncrushable/EHP, balanced) as tables
  with a **Copy Pawn string** per scale (`( Pawn: v1: "Tankadin <label>": Key=val, … )`) + a how-to
  (custom weights / Pawn import / manual entry; gates aren't enforced by weights — hit 490 def & 102.4%
  first). Always visible (reference data, no export needed).
- **Leg armor in lock conditions — verified already handled.** Player flagged "other enhancement types
  (e.g. runic spellthread)" for the keep/lock completeness check. Leg armor IS an item enchant
  (Spellthread 2748 / Nethercleft 3013) stored in the enchant slot, which `lockEligible` already checks
  via `bestEnchant('legs') && !enchantId` — confirmed end-to-end (leg locks showing Runic Spellthread;
  a leg without it reads incomplete). Added a regression test. Suite **115 pass**.
- **No waist-enhancement gap after all.** The audit showed the waist takes no enchant in our DB; I'd
  flagged the Eternal Belt Buckle as missing — but the player corrected: the belt buckle is a **WotLK**
  item, not in TBC. TBC belts have no slot enhancement, so the waist correctly has none. Conclusion:
  **all TBC enhancement types are already covered** in the lock conditions (gems + every slot enchant,
  incl. leg armor). No socket-enhancement pass needed for TBC. (`socketsFromStats` dropping
  `socketPrismatic` is therefore moot for TBC.)

---

## 2026-06-27 (c) — Per-gem socket color (bonus actually activates in-game)

**Trigger:** player testing "re-gem everything" saw a shoulder's socket bonus grey out in-game even
though the recommended gems (Veiled + Glowing Nightseye) *could* earn it.

**Diagnosis:** the solver was RIGHT — at 1:2 it picks Veiled→yellow, Glowing→blue and credits the +4
stam bonus. But `perSlot.gems` dropped the per-gem socket color, so when socketed in-game the gems
went into the wrong sockets (Justicar Shoulderguards' sockets are physically blue-then-yellow) and
the bonus greyed. Export socket order is **unreliable** (Lua `pairs()` — confirmed: base seg lists
BLUE,YELLOW; resolved lists YELLOW,BLUE), so placement must be **color-based**, not positional.

**Shipped:** `perSlot.gems[*].socket` now carries the socket color; the web paper-doll renders a
colored socket dot before each gem (`gemRow` + `.sock-*` CSS) so you place each gem in the matching
socket. Forfeited-bonus fills still tag the physical socket (a gem may sit off-color when the bonus
isn't worth it — that's intended). Tests: `test/gem-socket.test.js` (gems tagged only to real sockets
of the item; Justicar shoulder maps one gem per yellow/blue socket). Suite **112 pass**.

**Follow-up:** CLI still prints gems as an aggregate (no per-socket color) — fine for a dev tool; the
web UI is the player-facing readout.

**Update (same session):** per player request, replaced the bare color dot with a **per-socket cell**
— socket-color chip on top, the gem beneath it — and added a **manual-socketing note** on each set card.

**Update 2 (same session):** make the deliberately-skipped bonus explicit. `perSlot.bonusKept` is
computed from the FINAL gems (every colored gem fits its tagged socket → survives meta recolors).
Paper-doll shows **✓ Socket bonus active: +N Stat** (with color chips, placement matters) when earned,
**✕ Socket bonus skipped: +N Stat** (chips hidden — gem can go anywhere) when forfeited. Tests +2
(bonusKept ↔ all-gems-fit; shoulder skipped at 1:4). Suite **114 pass**.

---

## 2026-06-27 (b) — "Keep existing gems/enchants" build mode

Implemented the backlog item from earlier today: a build mode that uses items **as they sit** —
no re-gem/-enchant — for budget players and for items **shared across sets** that can't be re-gemmed
on every swap.

### Shipped (this commit)
- **Engine** (`runner.js`): `optimizeSets` option `keepGemsEnchants` — `true` (lock all),
  an item-id array, or `{ itemIds, slots }`. Locked items become a **single variant** scored on
  resolved stats (no focus/cap split); final gemming skips `planItemGems`/`bestEnchant` and instead
  contributes the `resolved − base` delta (kept gems + enchant + active socket bonus) on top of
  `baseStats` — no double-count. Current gems/enchant are reported by mapping the export's gem
  item-ids + enchant effect-id back to names via the curated DBs (`GEM_BY_ID`, `ENCHANT_BY_EFFECT`);
  unknown ids fall back to a generic label. Per-slot readout gains a `locked` flag.
- **CLI** (`bin/optimize.mjs`): `KEEP_GEMS=1` env toggle; selection lines show `[kept]`.
- **Web** (`index.html` / `app.js`): "Keep current gems & enchants" checkbox → `keepGemsEnchants`;
  paper-doll shows a **kept** tag; the Sixty-Upgrades export uses the kept gem/enchant ids.
- **Tests**: `test/keep-gems.test.js` (3) — keep-all locks socketed pieces to their current gems
  (no threat re-gem; control asserts the unlocked run DOES re-gem); no double-count (set SP == sum of
  picked items' resolved SP); per-item lock keeps only the named item, others still optimize. Suite **106 pass**.

### Refinement (player feedback, same session)
- **Only COMPLETE items lock** (`lockEligible`). An item with an empty socket (gem count < socket
  count) or a missing enchant the solver would apply (perks/phase/faction-aware) is treated as
  UNLOCKED, so the solver finishes it. Effect: "keep all" = preserve finished gems/enchants, optimize
  the unfinished — the useful budget default with no per-item list needed. Tests: +2 (eligibility
  truth table; keep-all skips an item with a blanked gem). Suite **108 pass**.
- **Scope presets (player chose dropdown over a 40-item list).** `keepGemsEnchants` extended to
  `{ equippedOnly?, ignoreCompleteness? }`; web dropdown + `KEEP_GEMS=all|equipped|current`:
  Re-gem everything / Keep all completed / Keep equipped completed / Keep current set as-is
  (the last sets `ignoreCompleteness` so worn-but-unfinished items still freeze). Tests +3 (110 total).
  **Caveat / follow-up:** "as-is" freezes the worn gems/enchants but does NOT pin item *selection* —
  the optimizer can still swap a slot to a strictly better item (then gemmed). A true no-swap
  "evaluate exactly what I'm wearing" mode (force-select equipped per slot) is the next increment if wanted.

### Limitations / follow-ups
- Meta activation tally doesn't count a **locked** item's current gem colors toward a *non*-locked
  item's meta requirement (locked plans contribute no colored choices). Fine for all-locked (no meta
  is re-picked) and harmless for partial locks (recolor only touches focus sockets), but a locked
  blue-heavy chest won't help a head's "3+ blue" meta activate. Note for later if it bites.
- Lock = "as it sits now": a locked item with **empty** sockets stays empty (we keep current, we
  don't cheap-gem). Intended, but worth a UI hint so budget users aren't surprised.

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
- ✅ **SHIPPED** (see the 2026-06-27 (b) entry above).
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

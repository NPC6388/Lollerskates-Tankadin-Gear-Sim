# Lollerskate's Tankadin Gear Sim — Build Plan

> A client-side gear simulator for WoW Classic TBC Anniversary Protection Paladins.
> Feed it the gear you already own; pick a goal (e.g. *Raid AoE Threat*, *Single-Target
> Survival*, a *Resistance Set*); it mixes and matches your items — plus gems and
> enchants — into the best legal set for that goal, enforcing the hard caps from the
> [Prot Paladin Tanking Guide](https://github.com/NPC6388/wow-tbc-prot-paladin-guide).

**Status:** Planning (this doc preserved before any code). Last updated 2026-06-22.
**Math source of truth:** the Prot Paladin Tanking Guide (`index.html`) and its
`tankadin sixtyupgrades weights.md` companion.

---

## 1. Decisions locked in (from the design interview)

| Topic | Decision |
|---|---|
| Game/client | WoW Classic **TBC Anniversary** — standard Blizzlike items, modern Classic addon API (2.5.x) |
| Hosting | **Pure client-side static site** on GitHub Pages — no backend |
| Repo | **New dedicated repo** (`Lollerskates-Tankadin-Gear-Sim`); imports the guide's math as source of truth |
| Stack | Vanilla HTML/CSS/JS (matches the guide — no build step, no framework), Chart.js for any charts |
| "Agent" | **Rule-based goal picker** (no LLM) — goals map to the guide's weight scales |
| Gear input | **Companion addon bulk-import** (primary) + **manual item search** (secondary) |
| Optimizer | **Heuristic by default + exhaustive toggle** |
| Gems/enchants | **Ideal by default**, with profession toggles (e.g. drop JC-only gems if no Jewelcrafting). Socket bonuses are *optional* — only gem-for-color when the bonus beats the best raw gem |
| Stat basis | **Toggle: unbuffed ↔ raid-buffed** |
| Talents | **Preset builds from the guide** (each carries its talent modifiers so caps compute correctly) |
| Professions | **Modeled** — user supplies their two professions |
| Caps | **Uncrittable always enforced**; **uncrushable per-goal** (required for survival goals, optional for farm threat) |

**Still to confirm:** the user's two professions; any tweaks to goals #1–4.

---

## 2. Goal menu (the "agent")

The goal picker is the rule-based agent. Each goal maps to a weight scale from the
guide's companion file and a set of required caps.

1. **Raid AoE Threat** — weight scale 3. Uncrushable optional.
2. **Raid Single-Target Threat** — weight scale 1, auto-switching to scale 2 as hit /
   expertise / spell-hit caps are reached. Uncrushable optional.
3. **Single-Target Survival (uncrushable / EHP)** — weight scale 5. Uncrushable required.
4. **Progression Spike Survival (max EHP)** — weight scale 4, stamina-leaned. Uncrushable required.
5. **Resistance Set** — see §4. Two selectors: **school** (Frost / Nature / Fire / Shadow /
   Arcane) and **target** (244 or 365). Uncrittable required; resistance target is a hard
   constraint; EHP is the tiebreaker. → 5 schools × 2 targets = **10 presets**.

Every goal always enforces **uncrittable**. All goals respect the unbuffed↔buffed toggle.

---

## 3. Architecture (modules)

1. **Data layer** — bundled JSON DBs (`items.json`, `gems.json`, `enchants.json`) of
   TBC-Anniversary standard values, scoped to everything a Prot Paladin can equip.
2. **Collection** — the gear you own; populated by addon paste-import (item IDs) or
   manual search against `items.json`.
3. **Character model** — applies the selected **talent build** + **buff toggle** +
   **professions** to turn raw item stats into final combat stats (defense skill,
   avoidance %, block %, crit/crush table, spell power, per-school resistance, EHP).
4. **Constraint engine** — the hard caps from the guide: uncrittable (490 def skill vs
   lvl 73, or resilience equivalent), uncrushable (102.4% combined w/ Holy Shield),
   hit / expertise / spell-hit cap awareness, and resistance targets.
5. **Scoring engine** — the weight scales (`tankadin-math.js`), with the threat scale
   auto-switching at the hit/exp caps.
6. **Optimizer** — two-phase (legalize, then maximize); heuristic + exhaustive (§5).
7. **Gem/enchant solver** — picks ideal gems/enchants per goal with socket-bonus-worth-it
   logic, meta-gem activation, and profession/JC toggles. Enables resistance gems/enchants
   for resistance goals.
8. **UI** — goal picker, result set with per-slot breakdown, **cap status panel**
   (green/red gates), unbuffed/buffed toggle, and a "why this piece" explanation.

---

## 4. Resistance sets (detailed)

**Mechanic.** Average spell mitigation vs a level 73 boss is
`Resistance / 365 × 75%`, capped at 75%.
- **365 total resistance = the hard cap** → 75% average mitigation (the max).
- **244 ≈ 50% mitigation** (244 / 365 × 75% ≈ 50%) → the lighter target.

So the target toggle is effectively "50%-mitigation set" (244) vs "fully-capped 75% set" (365).

**Optimizer flow for a resistance goal:**
1. The chosen school's resistance target is a **hard constraint** (like uncrushable),
   *while staying uncrittable*. If the collection can't reach it, report the closest
   achievable total and the gap.
2. **Buffs/auras count toward the total in the raid-buffed view.** Gear-only requirement
   shown in the unbuffed view; buffed view adds applicable party buffs so you see how much
   gear you actually need.
3. **Resistance gems & enchants enabled** — the solver slots resist gems/enchants
   (cloak, chest, etc.) to hit the target with the least sacrifice of EHP/avoidance,
   respecting JC/profession toggles.
4. Among all sets that hit the target and stay uncrittable, **maximize effective health**
   (resist sets bleed avoidance/threat, so EHP is the right tiebreaker).

**Paladin resistance aura note (accuracy):** paladin resistance auras give **+70** (max
rank) and exist only for **Frost, Fire, and Shadow**. There is **no Nature or Arcane**
paladin resistance aura — those sets get no self-aura and rely on external party buffs
(Mark of the Wild +all resist, Nature Resistance Totem, Aspect of the Wild for nature,
etc.). The buff toggle models available resist buffs per school.

---

## 5. The optimizer (the hard part)

- **Set bonuses break pure greedy.** Justicar 2pc/4pc threat bonuses are combinatorial,
  so the heuristic evaluates set-bonus thresholds explicitly; the exhaustive pass handles
  them naturally.
- **Heuristic (default):** greedy best-in-slot by weight → local swap search →
  **cap-repair pass** (if not uncrittable/uncrushable/at-resist-target, swap in the
  cheapest qualifying pieces until legal) → re-score. Instant for normal collections.
- **Exhaustive toggle:** branch-and-bound with pruning over owned items per slot; warns
  when the search space is large.
- **Gems/enchants** solved per finalized set, respecting meta-gem activation requirements
  and the socket-bonus-worth-it rule.

---

## 6. Talents, buffs, professions

- **Talents:** preset builds from the guide (e.g. standard Prot, max-threat Sanctity).
  Each preset carries its modifiers (block %, stamina %, armor, avoidance, Holy Shield)
  so the caps compute correctly.
- **Buffs:** unbuffed↔raid-buffed toggle. Buffed view matches the guide's reference
  profile assumptions and adds resist buffs/auras toward resistance targets.
- **Professions:** user supplies their two. Modeled perks (TBC): Blacksmithing sockets
  (gloves/bracers), Jewelcrafting special/JC-only gems, Enchanting ring enchants,
  Leatherworking armor kits / bracer fur lining, Engineering tinkers (cloak/gloves/etc.),
  Mining Toughness (+stamina), Alchemy mixology. Profession-locked gems/enchants are
  toggled out when the user lacks the profession.

---

## 7. Companion addon

- Small Lua addon (modern Classic API): scans **equipped + bags + bank** and exports a
  paste string of item IDs (plus currently socketed gems / applied enchants). The bundled
  DB resolves stats.
- Lives in this repo under `/addon` with install instructions.

---

## 8. Data layer (heaviest lift / biggest risk)

The **item database** — accurate TBC-Anniversary stats for all paladin-equippable gear —
is the largest data task. Approach: seed from a public TBC data dump, scope to relevant
slots/armor to keep it bounded, and hand-validate key tank pieces. Gems and enchants DBs
are smaller and similarly sourced.

---

## 9. Single source of truth

The weight scales and rating constants live in one `tankadin-math.js` module derived from
the guide, so the sim and guide never drift. Any future change to the guide's math should
flow into this module (and vice-versa).

---

## 10. Phasing (milestones)

1. **M1 — Core engine, no UI polish.** Math module + character model + constraint engine
   + scoring. **Validation gate:** must reproduce the guide's 709 SP reference-profile
   numbers exactly before M1 is "done."
2. **M2 — Manual collection + heuristic optimizer + goal picker.** Usable end-to-end with
   hand-entered gear.
3. **M3 — Item/gem/enchant databases + gem/enchant solver + professions + buff toggle.**
4. **M4 — Companion addon (bulk import).**
5. **M5 — Exhaustive toggle, resistance-set UI, "why this piece" explanations, polish,
   and a link from the guide.**

---

## 11. Open items
- [ ] User's two professions.
- [ ] Confirm/tweak goals #1–4.
- [ ] Source and scope the item database.
- [ ] Decide GitHub Pages enablement once there's something to serve.

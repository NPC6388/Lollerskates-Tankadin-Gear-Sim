# Lollerskate's Tankadin Gear Sim

A client-side gear simulator for **WoW Classic TBC Anniversary** Protection Paladins.

Show it the gear you already own, pick a goal — *Raid AoE Threat*, *Single-Target
Survival*, a per-school *Resistance Set*, and more — and it mixes and matches your items
(plus gems and enchants) into the best legal set for that goal, enforcing the hard tank
caps (uncrittable, uncrushable, resistance targets).

All the math comes from the
[WoW TBC Prot Paladin Tanking Guide](https://github.com/NPC6388/wow-tbc-prot-paladin-guide).

> **Status:** engine in progress — core math, optimizer, and the companion addon are
> built; gem/enchant DBs + UI are next. See [`PLAN.md`](PLAN.md) for the design and
> [`CHANGELOG.md`](CHANGELOG.md) for what's landed.

## Status
- **Done:** core math + constraint engine (M1), optimizer + objectives (M2 core),
  companion export addon (M4, currently **v7**).
- **Model:** a first-principles forward calc (race/class base + Avenger's Shield talents +
  gear) that reproduces the live character sheet to rounding — no back-fitting.
- **Set bonuses:** Justicar (T4) and Crystalforge (T5) detected by item ID.
- **In progress (M3):** item/gem/enchant databases, gem/enchant solver, professions.
- **Next (M5):** goal-picker UI, "why this piece" explanations, guide link.

## Planned features
- Goal-driven set optimization mapped to the guide's threat & survival weight scales
- Hard-cap enforcement: uncrittable always; uncrushable per goal; per-school resistance targets (244 / 365)
- Ideal gem & enchant selection with profession toggles (e.g. Jewelcrafting-only gems)
- Companion addon for one-click bulk import of your equipped + bag + bank gear
- Unbuffed ↔ raid-buffed toggle; preset talent builds from the guide
- Fast heuristic optimizer with an opt-in exhaustive pass

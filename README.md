# Lollerskate's Tankadin Gear Sim

A client-side gear simulator for **WoW Classic TBC Anniversary** Protection Paladins.

Show it the gear you already own, pick a goal — *Raid AoE Threat*, *Single-Target
Survival*, a per-school *Resistance Set*, and more — and it mixes and matches your items
(plus gems and enchants) into the best legal set for that goal, enforcing the hard tank
caps (uncrittable, uncrushable, resistance targets).

All the math comes from the
[WoW TBC Prot Paladin Tanking Guide](https://github.com/NPC6388/wow-tbc-prot-paladin-guide).

> **Status:** early planning — see [`PLAN.md`](PLAN.md) for the full design.

## Planned features
- Goal-driven set optimization mapped to the guide's threat & survival weight scales
- Hard-cap enforcement: uncrittable always; uncrushable per goal; per-school resistance targets (244 / 365)
- Ideal gem & enchant selection with profession toggles (e.g. Jewelcrafting-only gems)
- Companion addon for one-click bulk import of your equipped + bag + bank gear
- Unbuffed ↔ raid-buffed toggle; preset talent builds from the guide
- Fast heuristic optimizer with an opt-in exhaustive pass

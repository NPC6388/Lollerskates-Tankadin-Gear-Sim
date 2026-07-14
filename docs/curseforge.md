# Addon Listing Copy — CurseForge / WoWInterface

Ready-to-paste listing package for **Tankadin Gear Sim**. Copy the block that fits the
site; both use the same body. Screenshots reference `docs/assets/` (see
[`asset-checklist.md`](asset-checklist.md)) — swap the placeholders for the real captures
before publishing.

---

## Project title

Tankadin Gear Sim

## One-line summary

A live tank readout and in-game gear optimizer for WoW TBC Classic (Anniversary) Protection Paladins.

## Short description (~2 sentences)

Tankadin Gear Sim shows your uncrittable / uncrushable / EHP status live off your
character sheet and recomputes as you swap gear. Its in-game Optimize tab reads your bags
and bank and builds seven tuned tank sets — four for everyday content plus dedicated
Illidan, Sunwell, and Brutallus encounter sets — that you can preview and equip from a
minimap button, and gear tooltips show the threat / EHP change vs the item you'd replace.
Same math as the companion website and the tanking guide it's built on.

## Long description

**Tankadin Gear Sim** is a free, open-source addon for **WoW TBC Classic (Anniversary
client) Protection Paladins**. It answers the question every tankadin actually asks:
*given the gear I already own, what's the best set I can put together right now?* — without
alt-tabbing to a spreadsheet.

![Live tank readout](docs/assets/addon-live-readout.png)

**Live tank readout.** Type `/tgs` and read your equipped set straight off the character
sheet: crit reduction vs raid/heroic (uncrittable ✓/✗ + surplus), the avoidance
breakdown, **uncrushable** status + crush surplus, armor damage reduction, physical EHP,
spell power, and block value. It recomputes as you swap pieces. Toggle **Assume Holy
Shield** and **Assume Kings + Mark of the Wild** to see the numbers a real pull actually
uses. It auto-detects your faction and professions.

![Optimize tab with sliders](docs/assets/addon-optimize-tab.png)

**Optimize without leaving the game.** The Optimize tab reads your bags and bank and
builds seven tuned sets, each honoring the hard tank caps (uncrittable always; uncrushable
per goal). Four everyday sets:

- **Raid Threat** — max threat while staying capped for a raid boss.
- **Survival** — lean into effective health and avoidance for single-target progression.
- **AOE Trash** — built for holding packs of mobs.
- **Balanced** — a middle-ground set for general content.

…plus three **encounter sets** built for the fights that break the usual rules:

- **Illidan** — Shear can't miss, so this set targets the lower 101.8% dodge/parry/block gate.
- **Sunwell** — Radiance guts your dodge, so this leans effective health while keeping the
  avoidance it can.
- **Brutallus** — the pure-EHP wall (no threat, no block value), for the >20k-HP check.

Per-goal **EHP↔Threat** and **minimum-HP** sliders let you nudge each set toward your own
priorities and re-solve.

**Gear tooltips that show the trade.** Hover any piece of gear and the tooltip appends the
**Threat** (spell-power-equivalent) and **Effective HP** change versus the item you'd
replace — so you can see at a glance whether a drop is an upgrade for your tank set, without
opening the optimizer.

![Minimap flyout equipping a set](docs/assets/addon-minimap-flyout.gif)

**One-click preview and equip.** A minimap button opens an ItemRack-style flyout of your
sets — hover to preview, click to equip. Swapping a set keeps your gems and enchants
intact.

![Export tab](docs/assets/addon-export-tab.png)

**Same math as the companion site + guide.** Export your gear with one click and upload it
to the [companion website](https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/) for
the same optimizer plus a **gem/enchant solver**, phase selection, and BiS
"pretend I own this" planning. The in-game engine is a Lua port that's parity-tested
against the site's JavaScript, and all the math comes from
[Lollerskate's TBC Prot Paladin Tanking Guide](https://npc6388.github.io/wow-tbc-prot-paladin-guide/).
No hidden back-fitting — it's a first-principles forward calc that reproduces your
character sheet to rounding.

**Status:** working beta (v0.8.x). Bug reports and feedback are very welcome on
[GitHub](https://github.com/NPC6388/Lollerskates-Tankadin-Gear-Sim/issues).

## Commands

- `/tgs` (or `/tankadin`) — open on the **Live** readout.
- `/tgs export` — open the **Export** tab (copy box for the website).

## Categories / tags

- **Categories:** Buffs & Debuffs / Combat, Character Advancement, Optimizations, Libraries (choose the closest your host allows — e.g. CurseForge "Buffs & Debuffs" + "Optimizations").
- **Tags:** Protection Paladin, Paladin, Tank, Tanking, TBC, Burning Crusade, TBC Classic, Anniversary, Gear, Optimizer, Uncrushable, Uncrittable, Threat, EHP, Theorycraft.

## Links

- **Companion website (optimizer + gem/enchant solver + BiS planning):** https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/
- **Tanking guide (math foundation, external):** https://npc6388.github.io/wow-tbc-prot-paladin-guide/
- **Source & issues (GitHub):** https://github.com/NPC6388/Lollerskates-Tankadin-Gear-Sim

## Compatibility

- Built for **WoW TBC Classic, Anniversary client**. Interface version **20504**.
- The Interface version goes stale each Anniversary content patch, so the addon may show
  as **"Out of date."** If it does, tick **Load out of date AddOns** on the character-select
  AddOns list — it still works. An updated build follows each patch.

## License

MIT. Author: NPC6388.

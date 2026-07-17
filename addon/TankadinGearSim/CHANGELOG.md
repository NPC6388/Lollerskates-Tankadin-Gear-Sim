# Tankadin Gear Sim — Changelog

This is the player-facing changelog shipped with the addon (and used as the release notes on
GitHub/CurseForge). The full development log lives in the repo's root `CHANGELOG.md`.

## v0.8.45 — initial public release

The companion addon for [Lollerskate's Tankadin Gear Sim](https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/):
a Protection Paladin gearing tool for TBC Anniversary realms.

- **Live readout** (`/tgs`): uncrittable / uncrushable / avoidance / EHP versus a raid boss,
  computed from your character sheet with the same engine as the website. Holy Shield toggle
  included.
- **In-game optimizer**: solves four goal sets (Threat / Survival / Balanced / Uncrushable-first)
  plus encounter presets (Illidan Shear 101.8% gate, Sunwell Radiance, Brutallus EHP-wall) over
  everything you own — bags, bank, and equipped — including per-item gem and enchant planning
  with socket-bonus math. Runs across frames, so no client hitching.
- **Honest uncrushable certification**: a 0.3% safety margin covers the small gap between
  rating-math and the game's character-sheet math, so a set marked ✓ stays uncrushable when you
  actually equip it.
- **Gear tooltips**: threat and EHP deltas versus your equipped item, on every item tooltip.
- **Minimap flyout**: equip any solved set in one click, ItemRack-style.
- **Website export** (`/tgs export`): one string carries your full collection into the web sim
  for deeper analysis, sharing, and what-if planning with unowned items.

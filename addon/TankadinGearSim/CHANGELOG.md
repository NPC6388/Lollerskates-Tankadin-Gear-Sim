# Tankadin Gear Sim — Changelog

This is the player-facing changelog shipped with the addon (and used as the release notes on
GitHub/CurseForge). The full development log lives in the repo's root `CHANGELOG.md`.

## v0.8.47

- **Your equipped set is now the baseline every goal is measured against.** The optimizer starts its
  search from the gear you are actually wearing, and will never hand back a set that scores worse
  than it. If nothing you own beats what is on your back for a goal, the card now says so outright
  ("already equipped - best available") instead of showing a sidegrade that looks like an upgrade.
- Locked trinkets and pinned slots still win: if you asked for a piece you are not currently wearing,
  the optimizer honors that choice rather than quietly falling back to your equipped set.

## v0.8.46

- **Proc trinkets are now scored instead of counting as an empty slot.** The game reports no stats
  at all for Tome of Fiery Redemption, so the optimizer treated it as a dead slot — and because the
  locked-trinket dropdowns default to what you have equipped, every solved set carried that dead
  slot and could never beat your current gear. Its +290 spell-damage proc is now valued at its
  measured raid uptime (~66 spell power on average), which correctly ranks it ahead of Eye of
  Magtheridon for single-target threat.
- **Re-gemming can no longer suggest a downgrade.** The gem solver could return a configuration
  scoring below the gems already sitting in your gear (it overshot the uncrushable cap and gave up
  stamina). It now always compares against your current gems and keeps whichever is better, so a
  solved set is never worse than what you are already wearing.

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

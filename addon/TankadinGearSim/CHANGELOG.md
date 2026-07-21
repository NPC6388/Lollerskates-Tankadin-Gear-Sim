# Tankadin Gear Sim — Changelog

This is the player-facing changelog shipped with the addon (and used as the release notes on
GitHub/CurseForge). The full development log lives in the repo's root `CHANGELOG.md`.

## v0.8.50

- **The optimizer now reads your actual talents.** It was assuming the reference build (Anticipation
  5, Toughness 5, Sacred Duty 2, Combat Expertise 5) for everyone, which handed a differently-specced
  paladin armor, stamina and defense skill they don't have. Your live spec is now fed straight into
  the solve, so the numbers on the cards are yours.
- **Cards now tell you when re-gemming would beat the set you're being shown.** The addon still never
  re-gems or re-enchants — its sets are what you'd have the moment you equip them — but after the
  solve it quietly runs the same goals a second time WITH re-gemming allowed. Where that would be a
  real improvement, the card adds a line: what the EHP and spell power could be, and how much you'd
  gain. Planning and applying that is the sim site's job; this just makes sure you know the option
  exists rather than leaving it invisible.

## v0.8.49

- **The export now carries your professions, and the website fills its dropdowns in from them.** The
  site defaulted everyone to Enchanting, which quietly recommended ring enchants to players who
  cannot apply them and withheld JC gems / Blacksmithing sockets from players who have them. Your
  two professions now ride along in the export (`P:` line, format v12) and the site selects them for
  you on load — still ordinary dropdowns you can change whenever you like. The addon's own Optimize
  tab already detected them; both now use one shared implementation, so they cannot disagree.

## v0.8.48

- **The spell power on each set card is now the number your character sheet will show.** Tome of
  Fiery Redemption's proc is valued at its average uptime (~66 spell damage) so the optimizer scores
  it honestly — but that is a temporary buff, not a stat, and it was being added into the card's
  displayed Spell Power. A card claiming 818 while your paper doll read 752 looked like the sim
  inventing numbers. The card now shows your literal, on-the-sheet spell power, with any modeled
  effect (a proc trinket's buff, a libram's Consecration damage) trailing separately as a dim "+N".
  Set selection and threat ranking are unchanged — the full value is still what the optimizer scores.

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

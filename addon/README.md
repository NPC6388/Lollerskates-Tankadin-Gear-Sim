# Tankadin Gear Sim — Exporter Addon

A tiny WoW Classic (TBC Anniversary) addon that exports your gear and current
character stats for [Lollerskate's Tankadin Gear Sim](../README.md).

## Install
1. Copy the `TankadinGearSim` folder into
   `World of Warcraft\_classic_\Interface\AddOns\`.
2. Restart the client (or `/reload`). Enable it on the character-select AddOns list;
   if it shows as out of date, tick **Load out of date AddOns**.

## Use
1. **Open your bank** first if you want banked gear included.
2. Type `/tgs` (or `/tankadin`).
3. In the window that opens: **Ctrl+A**, **Ctrl+C**, then paste the string into the sim.

## What it exports
- **Line 1:** `TGS1` (format version)
- **Line 2:** `C:...` — your current character-sheet finals (dodge/parry/block %,
  defense skill, spell power, armor, stamina, etc.). The sim uses these to **calibrate**
  its base-stat model to your character exactly.
- **Then:** one `I:item:...` line per owned item (equipped + bags + bank + reagent bank),
  de-duplicated. Per-item stats are read from the item's **tooltip**, so they include
  **gems and enchants** (not just the base item), plus empty-socket counts for the gem
  optimizer. Item stats are English-tooltip parsed; if a stat looks missing, tell the dev
  which item so the phrase pattern can be added.

Everything is read defensively, so a missing API on a given client build is skipped
rather than erroring. If a stat comes through blank, tell the dev which one and it'll
get a fallback.

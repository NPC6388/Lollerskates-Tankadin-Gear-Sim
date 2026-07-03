# Tankadin Gear Sim — In-game Addon

A WoW Classic (TBC Anniversary) addon for Protection Paladins. It does two things:

1. **Live readout (v0.8.0+):** reads your *equipped* set straight off the character sheet and
   shows the tank checks in-game — crit reduction vs raid/heroic (uncrittable ✓/✗ + surplus),
   the avoidance breakdown, **uncrushable** status + crush surplus, armor DR, physical EHP, spell
   power and block value — recomputing as you swap gear. Same math as the website (the ported
   engine is parity-checked against the JS `evaluateSet`).
2. **Export:** dumps your gear + stats + talents as a string for the full
   [website sim](../README.md) (optimizer + gem/enchant solver still live there).

## Commands
- `/tgs` (or `/tankadin`) — open the window on the **Live** readout.
- `/tgs export` — open the **Export** tab (copy box + SavedVariables flush).
- In the Live tab, tick **Assume Holy Shield up** to include/exclude the +30% block in the
  uncrushable check.

## Install
1. Copy the `TankadinGearSim` folder into your client's AddOns folder. For TBC
   Anniversary that's `World of Warcraft\_anniversary_\Interface\AddOns\`.
2. Restart the client (or `/reload`). Enable it on the character-select AddOns list;
   if it shows as out of date, tick **Load out of date AddOns**.

## Use (export to the website)
1. **Open your bank** first if you want banked gear included.
2. Type `/tgs export` (or `/tgs`, then click the **Export** tab).
3. In the box: **Ctrl+A**, **Ctrl+C**, then paste the string into the website sim.

## What it exports
- **Line 1:** `TGS<version>` (format version; currently `TGS9`)
- **Line 2:** `C:...` — your current character-sheet finals (dodge/parry/block %,
  defense skill, spell power, armor, strength/agility/stamina/intellect, etc.). The sim
  uses these to **reconcile** its first-principles forward calc against your real sheet.
- **Then:** one item line per owned item — `E:` for equipped, `I:` for everything else
  (bags + bank + reagent bank), de-duplicated. Each line is
  `<itemString>|<resolved>|<base>|<socketBonus>`:
  - **resolved** — stats read from the item's **tooltip**, so they include the **gems and
    enchants currently applied** (the gear "as worn"), plus currently-empty socket counts.
    Reads the in-game "Spell Damage" wording, splits combined stat lines, counts socketed-gem
    primaries, reads a shield's base block, and **skips inactive (grey) socket bonuses**.
  - **base** (v8) — stats from `GetItemStats` on the gem/enchant-**stripped** base link, so it
    carries the clean item and the **full socket-color layout** (every socket, even filled
    ones). The gem solver uses this to recommend re-gemming from a clean slate.
  - **socketBonus** (v8) — the item's socket bonus (the prize for matching all its socket
    colors), e.g. `ITEM_MOD_STAMINA_SHORT:4`, captured whether or not it's currently active.
    The solver decides per item whether matching colors to earn it beats raw gems.
  - **name** (v9) — the item's display name, so the sim can show real names instead of IDs.

  Item stats are English-tooltip parsed; if a stat looks missing, tell the dev which item so
  the phrase pattern can be added.

Everything is read defensively, so a missing API on a given client build is skipped
rather than erroring. If a stat comes through blank, tell the dev which one and it'll
get a fallback.

## Packaging (one-click download)

The site's "Download the addon" button serves `addon/TankadinGearSim.zip` (the folder zipped so it
extracts as `AddOns/TankadinGearSim/`). **Rebuild it whenever the .lua/.toc changes**, e.g. on Windows:

    Compress-Archive -Path addon/TankadinGearSim -DestinationPath addon/TankadinGearSim.zip -Force

(or `cd addon && zip -r TankadinGearSim.zip TankadinGearSim` on a unix shell), then commit the zip.

## Releasing (CurseForge + GitHub)

Pushing a `v*` git tag runs `.github/workflows/release.yml`
([BigWigsMods/packager](https://github.com/BigWigsMods/packager)), which reads the repo-root
`.pkgmeta`, builds a clean `TankadinGearSim/` package, attaches the zip to a GitHub Release, and
(once configured) uploads it to CurseForge. The one-time CurseForge setup (project id, `CF_API_KEY`
secret) and the release steps are documented in **[PUBLISHING.md](PUBLISHING.md)**. Until CurseForge
is wired up, tagging still produces the GitHub Release zip.

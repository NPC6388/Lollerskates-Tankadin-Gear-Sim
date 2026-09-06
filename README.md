# 🛡️ Lollerskate's Tankadin Gear Sim

[![Addon version](https://img.shields.io/badge/addon-v0.8.41-f0c674?style=flat-square)](addon/TankadinGearSim/TankadinGearSim.toc)
[![License: MIT](https://img.shields.io/github/license/NPC6388/Lollerskates-Tankadin-Gear-Sim?style=flat-square&color=lightgray)](LICENSE)
[![Live site](https://img.shields.io/badge/%E2%96%B6%20live%20site-npc6388.github.io-5aa9e6?style=flat-square)](https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/)
[![Latest release](https://img.shields.io/github/v/release/NPC6388/Lollerskates-Tankadin-Gear-Sim?style=flat-square&color=f0c674&label=release)](https://github.com/NPC6388/Lollerskates-Tankadin-Gear-Sim/releases/latest)

**The best Protection Paladin set you can build from the gear you already own — solved in-game, refined on the web.**

Tankadin Gear Sim is a free, open-source toolkit for **WoW TBC Classic (Anniversary
client) Protection Paladin** tanks, built by NPC6388. It answers the question every
tankadin actually asks: *given the gear I already own, what's the best set I can put
together right now?* It reads your character straight off the sheet, enforces the hard
tank caps (uncrittable, uncrushable, min-HP), and mixes your bags + bank into tuned sets
for whatever you're about to pull — no spreadsheet, no back-fitting.

All the math comes from
[Lollerskate's TBC Prot Paladin Tanking Guide](https://npc6388.github.io/wow-tbc-prot-paladin-guide/).

---

## The three parts

One product, three surfaces. Start in-game; go deeper on the web.

### 1. The in-game addon — *Tankadin Gear Sim* (this repo)

The center of gravity. A native-frame addon (`/tgs`) that turns your character sheet
into a live tank readout and a full set optimizer without leaving the game.

![Live tank readout: the /tgs window on the Live tab showing uncrittable and uncrushable status with surplus, avoidance breakdown, armor DR, physical EHP, spell power, and block value, with Assume Holy Shield and Assume Kings+MotW toggles](docs/assets/addon-live-readout.png)

### 2. The website — the sim at [npc6388.github.io/Lollerskates-Tankadin-Gear-Sim](https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/)

The same optimizer, plus a gem/enchant solver, phase selection, BiS "pretend I own
this" planning, and a **Compare gear** tab that prices any item you own slot by slot —
all running client-side in your browser from the addon's export. The Lua port is
parity-tested against this JS engine, so the numbers match.

![Website results paper-doll: a solved set card with per-slot items, gems, enchants, uncrittable and uncrushable pass badges, and the stat panels](docs/assets/site-results-paperdoll.png)

### 3. The guide — [Lollerskate's TBC Prot Paladin Tanking Guide](https://npc6388.github.io/wow-tbc-prot-paladin-guide/)

A **separate external project** — the theorycraft the math implements. This repo links
it; it never rehosts it. When a number here needs justifying, it points back to the guide.

---

## Quickstart

1. **Install the addon.** Download it from the
   [Live site](https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/) ("Download the
   addon") or grab the [latest GitHub release](https://github.com/NPC6388/Lollerskates-Tankadin-Gear-Sim/releases/latest),
   and unzip so you end up with
   `World of Warcraft\_anniversary_\Interface\AddOns\TankadinGearSim\`. Restart the
   client and enable **Tankadin Gear Sim** on the character-select AddOns list (tick
   *Load out of date AddOns* if needed).
2. **Open the window.** Type `/tgs` (or `/tankadin`). The **Live** tab shows your tank
   checks off the current sheet; toggle **Assume Holy Shield** and **Assume Kings+MotW**
   to match a real pull.
3. **Optimize.** Open the **Optimize** tab (open your bank first to include banked gear)
   and solve for four tuned sets — **Raid Threat**, **Survival**, **AOE Trash**, and
   **Balanced** — nudging the per-goal EHP↔Threat and Min-HP sliders to taste.
4. **Equip in one click.** Use the minimap button's ItemRack-style flyout to preview and
   equip any set; it keeps your gems and enchants.
5. **Go deeper on the web.** Run `/tgs export`, then `/reload` to flush the file to disk,
   and upload your `SavedVariables\TankadinGearSim.lua` to the
   [sim site](https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/) for the
   gem/enchant solver, phase planning, and BiS what-ifs.

![Optimize tab: the four tuned sets (Raid Threat, Survival, AOE Trash, Balanced) with per-goal EHP-to-Threat and Min-HP sliders after a solve](docs/assets/addon-optimize-tab.png)

![Minimap flyout: clicking the minimap button opens an ItemRack-style list of the optimizer's sets, hovering previews a set, and clicking equips it](docs/assets/addon-minimap-flyout.gif)

---

## Features

**In-game (addon)**

- **Live tank readout** off the character sheet: uncrittable vs raid/heroic (✓/✗ +
  surplus), full avoidance breakdown, **uncrushable** status + crush surplus, armor DR,
  physical EHP, spell power, and block value — recomputing as you swap gear.
- **Buff-aware toggles** — Assume Holy Shield (+30% block) and Assume Kings + Mark of the
  Wild (they stack) so the numbers match a raid pull. Auto-detects faction + professions.
- **In-game Optimize tab** — reads bags + bank and builds four tuned sets (Raid Threat /
  Survival / AOE Trash / Balanced) with per-goal EHP↔Threat and Min-HP sliders; each set
  is gate-enforced (uncrittable always, uncrushable + min-HP per goal).
- **Minimap flyout** — ItemRack-style preview/equip of any optimized set in one click,
  preserving gems and enchants.
- **One-click export** — `/tgs export` dumps your gear + stats + talents for the website.

**On the web (sim)**

- Same four-set optimizer as the addon, plus a **gem/enchant solver** (weight-driven,
  profession-gated, socket-bonus-worth-it aware) and **phase selection**.
- **BiS planning** — "pretend I own this" to see the ceiling for a slot or a whole set.
- **Compare gear tab** — pick a baseline (your equipped gear, or any solved set) and a slot,
  and every item you own for it is ranked by **ΔEHP** and **ΔDPS**, with the uncrittable /
  uncrushable / min-HP gates checked per candidate. Sort by any column heading. Click pieces to try
  them on — they stay in as you move between slots, and the readout tracks the running total against
  the gear you started with. Gem each candidate optimally or use what's
  socketed in it right now; one click forces a piece into the slot and re-solves around it.
- **Damage per second** on every set — the guide's per-ability formulas summed for a fixed rotation,
  with the breakdown on hover. Abilities only (the export carries no weapon damage, so melee swings
  aren't modelled), and a readout rather than the optimizer's objective — selection still runs on the
  spell-power weight scales.
- Wowhead tooltips on every item link; copy-a-share-link for results.
- Runs entirely client-side — your export never leaves your browser.

![Export tab: /tgs export showing the copy box and the SavedVariables flush hint used to upload gear to the website](docs/assets/addon-export-tab.png)

---

## The math

No hidden back-fitting. The engine is a **first-principles forward calc** — L70 race/class
bases + the guide's Avenger's Shield talent build + gear, from documented constants — that
reproduces the live character sheet to rounding (dodge/parry exact; defense skill within
+0.06; block within ±1 on a known WoW-side rounding quirk). It enforces the guide's hard
gates: uncrittable (the 490 crit-immunity gate), uncrushable (the 102.4% avoidance+block
threshold), and per-school resistance targets (244 / 365). Tier set bonuses — Justicar
(T4) and Crystalforge (T5) — are detected by item ID and folded into threat and block.

Every weight and threshold traces back to
[**Lollerskate's TBC Prot Paladin Tanking Guide**](https://npc6388.github.io/wow-tbc-prot-paladin-guide/).
The Lua port that runs in-game is parity-checked against the JS `evaluateSet` so the addon
and the website never disagree. For what's landed milestone by milestone, see
[`CHANGELOG.md`](CHANGELOG.md); for the design, see [`PLAN.md`](PLAN.md).

---

## Repository layout

| Path | What it is |
|------|-----------|
| `addon/TankadinGearSim/` | The in-game addon: ported engine (`engine/`), UI, exporter, optimizer, minimap. |
| `src/` | The JS sim engine (source of truth the Lua is parity-tested against). |
| `web/` + `index.html` | The website front-end served from GitHub Pages. |
| `docs/` | [`explainer.md`](docs/explainer.md), [`visual-identity.md`](docs/visual-identity.md), asset checklist; screenshots live in `docs/assets/`. |
| `src/dps.js` | Steady-state ability-DPS rollup over `threat.js` — the readout behind the DPS figures. |
| `src/compare.js` | Per-slot drop-in gear comparison (ΔEHP / ΔDPS / gates) behind the Compare tab. |
| `test/` | Engine tests. |
| `CHANGELOG.md` / `SESSION_LOG.md` | What's landed, newest last. |

---

## Build & release

- **Addon install/packaging notes:** [`addon/README.md`](addon/README.md).
- **Cutting a release** (push a `v*` tag → GitHub Action runs
  [BigWigsMods/packager](https://github.com/BigWigsMods/packager) → GitHub Release, and
  CurseForge once configured): [`addon/PUBLISHING.md`](addon/PUBLISHING.md).
- The website's "Download the addon" button serves the committed
  `addon/TankadinGearSim-v<version>.zip` (named for the `.toc` version); rebuild it with
  `npm run build-addon` whenever the `.lua`/`.toc` changes (see
  `addon/README.md`).

---

## Status

Actively developed. The addon is at **v0.8.41** — live readout, in-game four-set
optimizer with sliders, minimap equip, and website export are all shipping. The gem/enchant
solver, phase planning, and BiS what-ifs live on the website. Faction (Scryer/Aldor) gem
handling and a spell-hit soft cap are the main open threads — see
[`CHANGELOG.md`](CHANGELOG.md) and [`SESSION_LOG.md`](SESSION_LOG.md).

## License

[MIT](LICENSE) © NPC6388. The Tanking Guide is a separate project by its own author —
linked, not vendored.

# Tankadin Gear Sim — Step-by-Step Tutorial

Tankadin Gear Sim is a free toolkit for **WoW TBC Classic (Anniversary client)
Protection Paladin** tanks. It has two parts that share the same math engine:

- an **in-game addon** (`/tgs`) with a live tank readout and an in-game Optimize tab, and
- a **website sim** for deeper gem/enchant, phase, and BiS planning.

This tutorial gives you two complete walkthroughs. Pick the one that fits what you want
to do:

- **[Path A — Optimize entirely in-game](#path-a--optimize-entirely-in-game)** — install
  the addon and never leave WoW.
- **[Path B — Export to the website for deeper planning](#path-b--export-to-the-website-for-deeper-planning)** —
  push your gear to the site for the gem/enchant solver, phase selection, and BiS
  planning.

All the math comes from
[Lollerskate's TBC Prot Paladin Tanking Guide](https://npc6388.github.io/wow-tbc-prot-paladin-guide/).
The Lua port in the addon is parity-tested against the website's JavaScript, so both
paths give you the same numbers.

---

## Path A — Optimize entirely in-game

### 1. Install the addon

1. Copy the `TankadinGearSim` folder into your AddOns folder. For the TBC Anniversary
   client that is:

   ```
   World of Warcraft\_anniversary_\Interface\AddOns\
   ```

2. Restart the client (or `/reload` if it is already running).
3. On the character-select screen, open the **AddOns** list and make sure
   **Tankadin Gear Sim** is enabled.
4. If it shows as out of date, tick **Load out of date AddOns**.

### 2. Open the Live readout

1. Log in on your Protection Paladin.
2. Type `/tgs` (or `/tankadin`) in chat. The window opens on the **Live** tab.

   ![Live tank readout](docs/assets/addon-live-readout.png)

The Live tab reads your **currently equipped** set straight off the character sheet and
recomputes as you swap pieces. Key things it shows:

- **Uncrittable** — whether you have enough crit reduction (defense + resilience/talents)
  that raid and heroic bosses cannot critically hit you, plus how much surplus you have
  over the cap.
- **Uncrushable** — whether your combined avoidance + block chance removes crushing blows,
  plus your crush surplus.
- **EHP (physical effective health)** — your health scaled up by armor damage reduction,
  i.e. how much raw physical damage you can actually eat.
- It also breaks down avoidance (dodge/parry/block), armor DR, spell power, and block
  value.

### 3. Set the buff assumptions

Two toggles make the numbers match a real pull instead of your naked-in-town state:

1. Tick **Assume Holy Shield up** to include the +30% block chance from Holy Shield in the
   uncrushable check. Bosses are only crush-free while it is active, so leave this on when
   you are checking a raid set.
2. Tick **Assume Kings + MotW** to add Blessing of Kings and Mark of the Wild. This applies
   the raid-buffed stats so your uncrittable/uncrushable status reflects what you will
   actually have on the pull.

Toggle these off to see your unbuffed baseline.

### 4. Open the Optimize tab

1. In the same window, click the **Optimize** tab.
2. The addon reads your bags and bank and solves for four tuned sets:
   - **Raid Threat** — maximizes single-target threat while staying uncrittable/uncrushable.
   - **Survival** — maximizes effective health and avoidance.
   - **AOE Trash** — tuned for holding multiple mobs.
   - **Balanced** — a middle ground between threat and survival.

   ![Optimize tab with sliders](docs/assets/addon-optimize-tab.png)

### 5. Tune each set with the sliders

Each goal has its own sliders so you can bias the solve:

1. Drag the **EHP ↔ Threat** slider to tell that goal how much to favor survival over
   threat (or the reverse).
2. Drag the **Min-HP** slider to force a minimum health floor; the solver will not hand you
   a set below it.
3. The set re-solves as you adjust, so you can watch the tuned result change.

### 6. Preview and equip a set from the minimap button

1. Click the **minimap button** to open the ItemRack-style flyout of your solved sets.

   ![Minimap flyout equipping a set](docs/assets/addon-minimap-flyout.gif)

2. Hover a set to **preview** it.
3. Click a set to **equip it in one click**. The swap keeps your existing gems and enchants
   on each piece.
4. Press **Escape** to close the flyout.

That is the full in-game loop: read your live status, solve, tune, and equip — without
leaving the game.

---

## Path B — Export to the website for deeper planning

The website runs the same optimizer plus a **gem/enchant solver**, **content-phase
selection**, and **BiS "pretend I own this"** planning. To use it, export your gear from
the addon and upload the SavedVariables file.

### 1. Open your bank first

1. Walk to a bank and **open it** before exporting.
2. This matters: the export only includes banked (and reagent-bank) gear if the bank is
   open when you export. If you skip this, banked pieces are missing from the plan.

### 2. Export your gear

1. Type `/tgs export` (or `/tgs`, then click the **Export** tab).

   ![Export tab](docs/assets/addon-export-tab.png)

2. The Export tab shows a copy box with your gear, stats, and talents encoded as a string.

### 3. Flush the export to disk with `/reload`

1. Type `/reload`.
2. This flushes the export to the SavedVariables file so the website can read it:

   ```
   World of Warcraft\_anniversary_\WTF\Account\<account>\SavedVariables\TankadinGearSim.lua
   ```

   Replace `<account>` with your account name.

### 4. Upload the file to the website

1. Open the sim: **https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/**
2. Upload the `TankadinGearSim.lua` file from the SavedVariables path above.

   ![Results paper-doll](docs/assets/site-results-paperdoll.png)

### 5. Run the optimizer

1. Pick your goal (e.g. Raid AoE Threat, Single-Target Survival, or a per-school Resistance
   Set).
2. Run the solve. The site mixes and matches your owned gear into the best legal set for
   that goal, enforcing the hard tank caps (uncrittable, uncrushable, resistance targets).
3. The results paper-doll shows per-slot items, gems, enchants, the pass/fail gate badges,
   and the stat panels.

### 6. Solve gems and enchants

1. Use the site's **gem/enchant solver** to recommend the ideal gems and enchants for the
   set — something the in-game Optimize tab does not do.

### 7. Select the content phase

1. Choose the **content phase** you are planning for so the sim scopes items and targets to
   that phase.

### 8. Plan BiS with "pretend I own this"

1. Use the BiS **"pretend I own this"** option to add items you do not yet have.
2. Re-solve to see what your set would look like if you owned that piece — useful for
   deciding what to chase next.

### 9. Copy the share link

1. Click the **Copy share link** button in the results header.

   ![Share link / copy-share](docs/assets/site-share-link.png)

2. Paste the link to share your exact result with anyone (or to save it for later).

---

## Troubleshooting

- **Addon shows "out of date"** — on the character-select AddOns list, tick **Load out of
  date AddOns**, then log in.
- **Banked gear is missing from the export** — your bank was not open when you ran
  `/tgs export`. Open the bank first, re-run the export, then `/reload`.

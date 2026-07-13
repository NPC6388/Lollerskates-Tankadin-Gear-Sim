# Session Log

Running handoff notes for resuming work. Newest session at the top.

---

## 2026-07-12 (latest) — Illidan gate → 101.8% (Shear), + SWP/BT gearing research

Research + one engine/addon change (v0.8.45), driven by the user watching Illidan/SWP tank guides and
cross-checking Warcraft Logs.

1. **Illidan uncrushable gate lowered from 102.4% → 101.8%.** Shear is a single special that can't miss and
   is fully avoided at dodge+parry+block(+HS) ≥ **101.8%** (per the community Shear-calc WA + guides), just
   under the 102.4% crush table. The Illidan preset had been reusing `CAPS.uncrushableCombined`, so it was
   0.6% stricter than the real Shear requirement. Fix = new `CAPS.shearAvoidanceTarget = 101.8` + a shared
   `crushTargetFor(enc, override)` helper in `src/constants.js`, threaded through `character.js` (illy*),
   `optimizer.js`, `runner.js`, `bin/optimize.mjs`, `web/app.js`, and mirrored in the addon
   (`Constants/Evaluate/Optimizer/Runner/UI.lua`). Sunwell + normal stay 102.4; `gates.uncrushableTarget`
   override still wins; `illyAvoidance` still excludes miss. Ratio left at `ehp:1, threat:2` (user: sliders
   handle EHP↔threat per raid comp — do NOT hardcode a stamina lean). Also made the web set-card crush chip
   encounter-aware (shows illy/swp avoidance vs its own target), which fixes the old card-vs-summary mismatch
   (the 88.6% Sunwell vs 111.1% card confusion from the start of the session). Boundary-verified: 101.7% fails,
   101.8% passes; 150 JS tests + 8 Lua parity suites green; eval fixtures regenerated (illyCrushSurplus +0.60).

2. **SWP presets → relaxed-crush Sunwell EHP set + max-EHP Brutallus set (7 goals total).** Key mechanic
   from the SWP video (iterated a few times with the user): in Sunwell **only Lady Sacrolash crushes, and a
   core set (Survival) covers her**, so the crush gate is RELAXED for the whole tier. The `sunwell` preset is
   now the **general Sunwell** set — `requireUncrushable:false`, `ehp:3/threat:1`, `lockEye:false`: **EHP focus
   that KEEPS high avoidance** (the `ehp` weight scale weights dodge/parry/defense ~0.7–1.0, stamina-led), and
   it still shows the ungated Radiance avoidance as a Sacrolash reference. Added a dedicated **Brutallus** set
   (`ehp:2/sta:1`, no threat, relaxed) — the tier's EHP WALL (>20k HP), takes all the EHP it can get; tankiest
   set on the sample export (38.8k EHP / 1258 stam / 351 SP). **No separate Sacrolash preset** (user: a core
   set works for her). Consumes/procs deliberately not modeled (per request). Illidan gate confirmed 101.8 (legal
   at 102.1%). Regenerated runner fixtures (24 goal results); all JS + Lua parity + Lua syntax green.
   **Addon Optimize tab PAGES the cards** (7 sets were too tall): core 4 (Raid/Survival/AOE/Balanced) on one
   page, encounter sets (Illidan/Sunwell/Brutallus) on another, toggle button + header label. `UI.lua`
   `paintCards()` splits by `goal.enc`; `PAGE_SIZE = max(core,enc) = 4` cards reused per page; min-height
   848→760; non-gated Uncrush (AOE/Sunwell/Brutallus) shown cyan not red. Two cosmetic fixes after an in-game
   /reload check: the pager label was overrunning the toggle button (now right-bounded + shortened to just
   "Core sets"/"Encounter sets"), and the encounter cards' focus text was truncating (shortened the Sunwell/
   Brutallus focus strings to fit the no-wrap line). Addon re-copied to the WoW install; zip rebuilt.

3. **Gear tooltip deltas (`Tooltip.lua`, new).** Hovering gear appends **TGS Threat (SP-eq)** + **TGS Effective
   HP** lines — the change vs the worn item it'd replace (Pawn-style). Threat = sim threat scale · stat delta
   (linear, SP-equivalent); EHP = full `aggregate`→`evaluateSet` re-eval (non-linear). Reuses
   `Exporter.readItemRaw`+`Items.build`, raid-buff toggle + default talents (matches the in-game optimizer),
   baseline cached + invalidated on `PLAYER_EQUIPMENT_CHANGED`. Hooks `GameTooltip`+`ItemRefTooltip`. Syntax
   OK (32 files), zip 33 files, installed. NOTE: adding a new `.toc` file may need a full WoW restart (not just
   /reload) to register — flagged to the user. Same blind spots as sim (set bonuses/procs/meta not modelled).
   **Still open:** the P3/P4/P5 mini-guide as a site page/artifact.

4. **TODO — badge-vendor items across phases.** The G'eras (Badge of Justice) vendor gains new gear each phase;
   those need adding to `web/bis.js` BiS lists in the appropriate phase columns as they unlock (see the
   [[badge-vendor-bis-updates]] memory). Not derivable from anything in-repo — a recurring per-phase chore.

5. **Research: P3–P5 tank mini-guide (delivered in-chat, not yet a site page).** Established the gearing arc:
   threat-first holds P2→P5 for an uncrit/uncrushable paladin; the exceptions are **avoidance-mechanic**
   fights (P3 Illidan/Shear = miss stripped; P5 Sunwell Radiance = −20% dodge, both already modeled) and the
   lone **stamina-item wall** — **Brutallus** (P5, ~18.9k HP target, block value poor vs 12k hits). Other SWP
   fights just lean HP-over-avoidance (no gear swap). Open follow-ups the user is still scoping: (a) a named
   **Brutallus preset** (EHP-max, Radiance-adjusted, crush gate relaxed) — the only genuinely new set; (b)
   fold the P3/P4/P5 breakdown into a site mini-guide; (c) consume notes (Scroll of Protection, stamina food,
   Ironshield pot, Nightmare Seed for P5) are for the mini-guide, NOT the sim. Full worn-set data lives on
   Warcraft Logs (Cloudflare-blocks automated fetch — zone 1011 / boss 609); documented P3 set backbone is on
   the honorscode progression post.

---

## 2026-07-11 — Illy/SWP as preset goals (not a toggle) + minimap right-click toggle

In-game vetting round. Two changes, engine + site + addon, all built & installed (v0.8.44):

1. **Illidan/Sunwell reworked from a global toggle into two always-on preset GOALS.** The old
   `encounter` option forced Raid/Survival/Balanced onto the reduced-avoidance gate, so on gear that
   can't reach it EVERY set went illegal (the bug the user hit). Now the optimizer returns **6 sets**:
   the 4 existing + **Illidan** + **Sunwell**. Each new preset (`GOAL_PRESETS` in both `src/runner.js`
   and `engine/Runner.lua`) carries a per-goal `enc` field, a threat-max ratio (`ehp:1, threat:2`),
   `lockEye`, and the uncrushable gate measured on that fight's avoidance. `runGoal`/`solveGoal` read
   `goal.enc` now (`ctx.encounter` left as a dead back-compat fallback). Meets the gate → leans surplus
   into threat; if the reduced cap is unreachable the set is returned flagged illegal (best-effort),
   not dropped. **On the sample gear: Illidan solves legal (102.6%, SP≈520); Sunwell can't reach the cap
   (84.2%) and is honestly flagged illegal** — that's physics (Radiance −5% miss / −20% dodge is brutal),
   not a bug. Site: `#encounter` select removed + all its state; Illy/SWP render no tuning slider
   (`filter(g => !g.enc)`); each summary Uncrush cell shows its own gate's metric. Addon: "Gear for:"
   checkboxes removed, 2 presets appended to the goal list, **6 goal cards** now (min height 746→848,
   tuning header −106→−84 reclaimed the checkbox row). Live pane Illy/SWP rows kept. Regenerated
   `runner_fixtures.lua` — JS↔Lua parity holds (21 goal results within 1e-6); 151 JS tests pass;
   31-file Lua syntax pass. Updated `test/librams.test.js` to skip the enc goals in its
   "uncrushable-required goals stay legal" invariant (their gate can be legitimately unreachable).
2. **Minimap right-click now TOGGLES** the window (was open-only) via the existing `UI.Toggle("optimize")`;
   tooltip updated. `Minimap.lua`.
3. **Made the encounter sets actually reach their gate (why they were still illegal).** Verified against
   the user's LIVE export on disk ([[savedvars-disk-path]]). Two root causes: (a) the optimizer's gate
   checks (`optimizer.js`/`Optimizer.lua` `gatesPass`/`gateDeficit`) measured only normal
   `totalAvoidanceWithHS` during SELECTION, so it aimed for normal uncrushable and never reached toward
   the harder encounter gate (only checked post-hoc in `finalLegal`); (b) the sets default-locked the two
   equipped THREAT trinkets (Icon + Eye of Mag), blocking the avoidance needed. Fix: added
   `crushAvoid(evald, gates)` keyed on `gates.enc`, `runGoal` threads `enc` into the optimizer's gates
   (`oGates`), and `lockFor` frees BOTH trinkets for enc goals. **Result on the user's phase-2 gear: both
   now solve LEGAL — Illidan 102.76%, Sunwell 102.69%** (Sunwell needs ~124.9% normal avoidance to beat
   Radiance's −20% dodge; it barely makes it). So the answer to "is Illidan impossible with my gear?" was
   NO. Regenerated optimizer + runner fixtures; parity holds; 150 JS tests pass.

**Trinket-lock note:** `lockEye: true` never hardcoded Eye of Mag — it means "honor the 2nd trinket
dropdown; None = free." On the site, own-gear defaults BOTH trinket dropdowns to none (nothing locked);
only the demo pre-fills Icon+Eye. The encounter sets now free trinkets entirely regardless (see above).

## 2026-07-11 — Per-phase×slot BiS audit + trinket-list completeness (site only)

Audited `web/bis.js` against a great local source the user pointed me to: the **AtlasLootClassic_TBCA_BIS**
addon's `data.lua` `data["PaladinTank"]` block (per-phase P1–P5, per-slot, ranked ids — no Wowhead JS
problem). Read-only scan of `…/Interface/AddOns`. Parser gotcha logged: build the block regex from a plain
`new RegExp('\\[P'+p+'_DIFF\\]…')`, NOT a heredoc template literal (backslashes got eaten → false "all
covered" pass). Findings + changes (all site, no addon bump):
- **Profession-gated items complete.** Tankatronic Goggles (Eng) is correctly P2 (AtlasLoot P2#3, ABSENT
  P1 — so my earlier hunch to add it to P1 was wrong, good I checked); Rocket Launcher P1–4; JC figurines
  present (AtlasLoot omits them, we're more complete). Added the missing Engineering ⓘ note to P2 goggles.
- **Trinkets:** added **Icon (29370)** + **Eye of Mag (28789)** to P1–P4 also-viable and extended **Tome
  (30447)** to P3–P4; P5 left out (Sunwell). Added `BIS_ITEM_DB` entries — Icon static +44 SP, Eye pure
  proc `{}` (verified vs wiki: Eye has NO static stat, +67 SP for 10s on resist).
- **Default locked trinkets → currently EQUIPPED** (`populateTrinketLocks` uses `item.equipped`); dropped
  the `DEFAULT_TRINKET_LOCKS` import. The addon already defaulted to equipped.
- **Dropdown label unified to "also viable - BiS list"** (was "≈N also viable" / "BiS list" by content).
- ~40 armor slots differ from AtlasLoot's stat-rank; **kept the Wowhead-guide ordering** per the user
  (source-opinion, not errors). 150 JS tests pass. Committed + pushed (`9dc6d67`) → site redeployed.

---

**Session wrapped (2026-07-11 → 07-12).** Everything above is committed + pushed to `main` and the site
is redeployed; addon v0.8.44 is built + synced to the install and verified in-game. Scratch harnesses
cleared. Open for a future session: none blocking — the per-phase×slot BiS audit is done (AtlasLoot local
data is the go-to cross-check source; the addon's own scrape omits profession-locked items). If BiS lists
are refreshed later, re-run the AtlasLoot diff rather than scraping Wowhead (JS-rendered / unfetchable).

**VERIFIED IN-GAME (v0.8.44):** the user confirmed all of it — 6-card Optimize sizing is good, minimap
right-click toggle works, trinket-lock dropdowns work, minimap flyout blue-coloring works, and the
Illidan/Sunwell sets generate. Site: the Illy/SWP sets weren't showing on the LIVE site because the work
was uncommitted (GitHub Pages deploys from pushed `main`); committed + pushed this session so the deployed
site now shows all 6. This clears the v0.8.41–0.8.44 in-game backlog.

REMAINING from last session (unchanged): per-phase×slot BiS audit vs the Wowhead guide for other missing
profession-craftable items (do NOT profession-gate — annotate). See [[bis-lists-show-prof-items-with-note]].

## 2026-07-11 — Site polish batch + logged tasks

User batch (logged here; "do what you can for now"):
1. **[DONE] Eye-of-Magtheridon** hardcoded in the Balanced blend-dial note (app.js ~432) → reworded generic
   ("2nd-trinket lock") since the user may lock different trinkets.
2. **[DONE] Broken graphics on the site** — the "About the ecosystem" hub `<img>`s are placeholders for
   screenshots that don't exist yet (docs/assets/*.png), rendering as broken-image icons on the LIVE site.
   Now hidden on load-error (JS in init) so the hub reads clean until a human captures them. Also bumped the
   stale "Addon v0.8.40" hub badge.
3. **[PARTLY DONE] Engineering item missing from the phase-2 also-viable list.** The example, **Goblin Rocket
   Launcher (23836), IS an Engineering TRINKET** (Goblin Engineer, +45 stam, on-use rocket; Phase 1 → usable
   all phases). It was already in `web/bis.js` trinket lists for phases **1, 3, 4** but **missing from phase 2**
   (and 5) — a scrape gap, since the user is in phase 2 they didn't see it. **FIXED:** added to phase-2 trinket
   list with an "Engineering only" note. (I earlier wrongly called it a gun — it is a trinket, confirmed by the
   in-game tooltip.) STILL TODO: (a) audit every phase×slot for other missing profession-craftable items vs the
   guide (https://www.wowhead.com/tbc/guide/classes/paladin/tank-bis-gear-pve); (b) optional PROFESSION-GATING
   so the BiS block hides items you can't craft (bisHTML has no prof filter today — it shows all, now with a
   note). Left phase 5 without it (outclassed by Sunwell trinkets).
   **USER PREFERENCE (confirmed):** do NOT profession-gate the BiS block — show profession-specific items to
   everyone WITH an ⓘ note. So (b) above is settled as "no gating"; the only remaining subtask is the (a)
   per-phase audit for other missing profession-craftable items.
4. **[DONE] Advanced settings button** — made larger / button-styled + more visible. (The "⚙ Change the
   options" link below the sets already opened it via `adv.open = true`.)
5. **[DONE] "Use my own gear" button** (`#useOwnBtn`, below the sample results) now walks the guided arrow to
   the "Use your own gear — install…" dropdown (`#ownGear`) and opens+scrolls to it.
6. **[REMINDER for next session] Check the addon updates in-game** — the user's addon-update mechanism lags
   this repo (see [[savedvars-disk-path]]); after a session that bumps the addon, verify in-game it's current
   (or reinstall from the freshly-built `addon/TankadinGearSim.zip`). Lots of addon versions shipped this
   session (up to v0.8.43), all UNVERIFIED in-game: trinket dropdowns, Illidan/Sunwell toggles + Live rows,
   minimap blue-coloring, the tuning-slider layout.

## 2026-07-11 — Minimap "not in bags" items blue; marketing package built; Illy/SWP formulas confirmed

- **Addon v0.8.41 — minimap flyout blue-coloring.** Set tooltip: white = in bags or worn (`haveReady` via
  `scanFor(BAGS)` + `GetInventoryItemID` slots 1-19); blue (0.5,0.7,1.0) = only in bank / unowned, ItemRack-
  style. Footer line notes "Blue = not in bags."
- **Marketing package (separate commit).** Five agents produced `docs/{explainer,visual-identity,asset-
  checklist,tutorial,curseforge,launch-posts}.md` + `docs/assets/.gitkeep`, an overhauled `README.md`, and an
  `index.html` "About the ecosystem" hub + fixed the dead `href="#"` guide link (now the real guide URL) +
  scoped `web/style.css`. Screenshots are placeholders — human must capture per `docs/asset-checklist.md`;
  CurseForge setup still TODO (per `addon/PUBLISHING.md`).
- **Illy/SWP formulas CONFIRMED (next build).** Illy (Illidan) = dodge+parry+block (Shear can't miss). SWP
  (Sunwell) = (miss−5) + max(0, dodge−20) + parry + block — Sunwell Radiance = boss +5% hit / −20% tank
  dodge. Both validated against the Tankadin II WA screenshot (Illy 56.89, SWP 49.87). NEXT: two engine-level
  toggles that force the optimizer's uncrushable gate to use the adjusted avoidance (+HS ≥ 102.4), plus
  Live-panel Illy/SWP readout lines. Needs JS+Lua engine change (keep parity) + fixture regen.
- **Illy/SWP SHIPPED (v0.8.42, engine + addon + site).** `evaluateSet` (character.js + Evaluate.lua) exposes
  `illyAvoidance` (dodge+parry+block+HS) and `swpAvoidance` ((miss−5)+max(0,dodge−20)+parry+block+HS) + their
  `*Uncrushable`/`*CrushSurplus`; new CAPS `sunwellHitReduction=5`/`sunwellDodgeReduction=20`. `runner.js`/
  `Runner.lua` take an `encounter` option ('illidan'|'sunwell'|null) via `encAvoid`/`encUncrush` helpers used
  in `finalLegal` (crushOk), the gate-recovery "improved" check, and solveGoal's `crushMet`. Addon: two "Gear
  for: Illidan/Sunwell" checkboxes (UI.encIllidan/encSunwell, Sunwell wins) + Live Illidan/Sunwell rows. Site:
  `#encounter` select in Advanced → optimizeSets + captureState(enc)/applyState + summary Uncrush column shows
  encounter value. Regenerated eval fixtures (`bin/gen-fixtures.mjs` — NOT in the hook, staged manually);
  hook regens runner/optimizer/solver fixtures (unchanged by default). Validated vs the WA to the decimal.
  Optimize min height 710→734 (encounter row); Live 448→482 (2 rows).
- **Trinket dropdowns SHIPPED (v0.8.43, addon).** Replaced the "keep equipped trinkets" checkbox with two
  `UIDropDownMenu`s (`ddIcon`/`ddEye`). `scanTrinkets()` (GetItemInfo equipLoc == INVTYPE_TRINKET over
  equipped 13/14 + bags/bank) fills `trinketList`; `UI.RefreshTrinkets()` (called from UI.Select "optimize")
  defaults `UI.lockTrinketIcon`/`Eye` to the equipped two, keeps a still-owned pick, else falls back.
  `trinketDropdown()` builds each with a "None" option. `UI.Optimize` → `trinketLocks = {icon,eye}` via
  `lockVal` (numeric locks; "none"/nil frees). pcall-guarded. Optimize min height 734→746 (dropdowns +12 vs
  the old checkbox). NOT eyeballed in-game — UIDropDownMenu layout/width at 380 min is the main unknown.

## 2026-07-10 — Spacing before the footer (addon v0.8.40)

Footer no longer overlapped (2 lines now) but sat flush against the Balanced card. Bumped Optimize min
height 686→710 so the bottom-anchored footer clears the cards with a ~26px gap. `.toc` → 0.8.40. JS 150/150,
31-file syntax PASS, zip rebuilt, installed synced, committed + pushed.

## 2026-07-10 — Footer overlap, for real this time (addon v0.8.39)

v0.8.38 didn't fix it: the "shortened" footer lines were still ~57 chars and each wrapped at the 380px min
width → 4 rendered lines → still overlapped the Balanced card (card4 l3 at pane-y −554; a 4-line bottom-
anchored footer's top lands ~−558 at height 686). Verified the min-clamp works (UI.Select clamps to
max(saved, TAB_MIN)), so height WAS 686 — the footer was just too tall. Rewrote the footer as two lines that
each fit in the 332px footer width at 380: "Keeps gems/enchants; profs & faction auto. Sim:" (47 ch) + bare
URL (48 ch). Now a reliable 2 lines (~24px), 686 clears it by ~16px. `.toc` → 0.8.39. Verified JS 150/150,
31-file syntax PASS, zip rebuilt, installed synced, committed + pushed.

## 2026-07-10 — Optimize tab: footer overlap + dead width fix (addon v0.8.38)

Screenshot at min size: the wrapping 2-logical-line footer (URL line) rendered ~4 lines and overlapped the
Balanced card; also too much blank space on the right. Fixes: shortened footer to 2 short lines
("Keeps your gems/enchants; profs & faction auto." / "Full sim: <url>"), narrowed both tuning sliders
120→110 and moved the Min-HP column x 190→176, min size 470×668 → **380×686**. Pane usable height =
frameHeight−74; card4 l3 ends ~pane-y −554, so 686 keeps the bottom-anchored footer (~24px) clear.
NOTE: the shared saved size persists — a previously-saved 470 width stays until the user drags narrower (min
now 380). `.toc` → 0.8.38. JS 150/150, 31-file syntax PASS, zip rebuilt, installed synced, committed + pushed.

## 2026-07-10 — Escape closes the window (addon v0.8.37)

`tinsert(UISpecialFrames, "TGSMainFrame")` in buildFrame so Escape hides the window like standard Blizzard
frames. `.toc` → 0.8.37. JS 150/150, 31-file syntax PASS, zip rebuilt, installed synced, committed + pushed.

## 2026-07-10 — Persist slider values across /reload (addon v0.8.36)

Slider positions (threat lean + Min-HP) were module tables that reset each reload. Now persisted in
`TankadinGearSimUI` SavedVariables: new `UI.LoadGoalPrefs()` (called at the top of `buildFrame`, which only
runs on user action so SavedVariables are loaded) links `UI.goalV`/`UI.goalMinHP` to
`TankadinGearSimUI.goalV`/`.goalMinHP`, seeding missing goals from `GOAL_V_DEFAULT`/`GOAL_MINHP_DEFAULT`. The
slider `apply` callbacks write `UI.goalV[id] = val` straight into the saved table → persists on logout.
Also in 0.8.36: **icon swaps** (raid=Sanctity Aura 20218, aoe=Consecration 26573, balanced=Aldori Legacy
Defender item 29275) resolved by ID (`GetSpellInfo`/`GetItemIcon`) with static fallbacks — if any render
blank the ID or fallback needs a tweak; **"AOEThr" → "AOE Threat"** on the AOE card (GOAL_SIDES.aoe.rlabel).
`.toc` → 0.8.36. Verified JS 150/150, 31-file syntax PASS, zip rebuilt, installed synced, committed + pushed.

## 2026-07-10 — Minimap set icons, SP/SH card, ratio centring, min-size fixes (addon v0.8.35)

Batch of fixes from more in-game screenshots:
- **Minimap set icons** — the flyout's per-set status was a `●` glyph rendering as an empty box. Replaced
  with a **thematic ability icon** per set (`SET_ICON`: raid=Righteous Fury, survival=Devotion Aura,
  aoe=Cleave, balanced=Seal of Justice — alt options in the code comment) + a ready-check ✓/✗ texture.
  Added `row.icon` to the flyout rows; `set.id` (raid/survival/aoe/balanced) keys the map.
- **Result cards SP → SP/SH** — now shows spell power AND spell hit % (`SP/SH 752 / 9.18%`), computed from
  `agg._raw.spellHitRating`/12.62 + Precision, mirroring the Live row.
- **Ratio centring (real fix)** — the value was anchored to the slider centre, so a wider "Threat" label
  made the gaps unequal. Now anchored LEFT→EHP.right, RIGHT→Threat.left, CENTER justify → equal blank space.
- **Min-size fixes** — pane = frameHeight − 74 (anchored TOPLEFT 8,−62 / BOTTOMRIGHT −8,12). Live 420→448
  (Spell-hit row + wrapping note were overlapping the bottom rows); Optimize 744→668 (content ends ~pane-y
  −554, so 744 left dead space the user couldn't shrink away).
- Verified JS 150/150, 31-file syntax PASS, zip rebuilt, installed synced. Committed + pushed.
  **In-game check pending:** icons render (swap any that show blank via `SET_ICON`), ratio reads centred,
  both frames size right.

## 2026-07-10 — Tuning + card polish from an in-game screenshot (addon v0.8.34)

Four small fixes off a screenshot of the working v0.8.33 Optimize tab:
- **Centre the ratio** — the value now anchors to the slider's centre (`centre:SetPoint("BOTTOM", s, "TOP")`)
  and the axis labels to its edges (`BOTTOMLEFT`/`BOTTOMRIGHT` to the slider), so `1:4` reads centred
  between `EHP` and `Threat` regardless of label widths. Reworked `tuneSlider` y-semantics: `y` is now the
  slider top; labels anchor above it. `goalSlider` slider y = name y − 30.
- **Header wraps** before "& Min-HP floor" (`\n`). Goals start shifted −88→−102.
- **Dropped "legal"** from result cards (the ✓ conveys it; failures still say "illegal"/"HP unreachable").
- **`EHP` → `EHP/HP`** on the card line that shows both numbers.
- Optimize min height 726→744; cards cy −320→−334.
- Verified JS 150/150, 31-file syntax PASS, zip rebuilt, installed synced. Committed + pushed.
  **In-game check pending:** the centred value sits mid-track, header wraps cleanly, cards read right.

## 2026-07-10 — Slider layout iterations to the user's mockups (addon v0.8.32–v0.8.33)

Two more layout passes on the Optimize tuning sliders (all addon-only, committed + pushed; user iterating
via screenshots):
- **v0.8.32** — the ◂/▸ text arrows rendered as boxes AND the user wanted real buttons on the slider ends.
  Replaced them with **arrow-TEXTURE buttons** (`arrowButton` using WoW's built-in spellbook page-turn
  textures `UI-SpellbookIcon-Prev/NextPage-Up/Down/Disabled` — reliable left/right glyphs, no font deps).
  Moved the label + value to the line above the slider. (Intermediate — superseded same session.)
- **v0.8.33** — user sent a precise mockup: `Set Name` on its own line, then `EHP  1:4  Threat` (left axis /
  centred value / right axis), then `[btn] ---- [btn]`. Implemented exactly: `tuneSlider` now draws a 3-part
  label line (three FontStrings sharing the slider's width box, LEFT/CENTER/RIGHT justify so they never
  collide), the centred CYAN value updates live, arrow buttons flank the slider. `goalSlider` is 3 lines:
  name, then the "EHP | ratio | Threat" and "off | hp | 20k" sliders side by side. Loop step -42→-56, cards
  cy -262→-320, Optimize min height 668→726.
- Verified each: JS 150/150, 31-file syntax PASS, zip rebuilt, installed synced. **Still NOT eyeballed
  in-game** — user to `/reload` and confirm the 3-part labels align over the sliders, the spellbook arrow
  textures render as ◄/► buttons, and nothing overlaps at the 726px min height.

## 2026-07-10 — Tuning rows relaid out (2-line/goal), box-arrows dropped (addon v0.8.31)

User sent an in-game screenshot: the ◂/▸ arrows rendered as **empty boxes** (WoW's font lacks U+25C2/25B8)
and the one-line rows were cramped (goal name truncated to "Su.."). Sent a mockup: goal name on its own line,
then `threat --- 1:4` and `hp min --- 11.5k` beneath. Implemented:
- **Two-line block per goal** — full name ("Raid Threat"/"Survival"/"AOE Trash"/"Balanced") on line 1, then
  the "threat" (EHP↔Threat) + "hp min" (floor) sliders on line 2. `GOAL_FULLNAME` replaces the abbreviated
  `GOAL_SLIDER_LABEL`. `goalSlider` now lays out name + two `tuneSlider`s at `cy = y-17`; loop step -22→-42.
- **Dropped the ◂/▸ glyphs** — flanking labels are now plain descriptive text ("threat" / "hp min" left, the
  readout right), still click-to-nudge (DIM, white on hover), drag still works. No font-dependent glyphs.
- Optimize min height 582→668; cards cy -178→-262.
- Verified JS 150/150, 31-file syntax PASS, zip rebuilt, installed synced. Committed + pushed (user on break).
  **Still needs in-game eyeball on return:** the 2-line layout fits without overlap and the labels nudge.
- Site: user confirmed the deployed Min-HP button restyle "looks good."

## 2026-07-10 — Slider labels ARE the buttons; balanced default 1:1; committed + pushed both (addon v0.8.29–v0.8.30 + site)

Two quick follow-ups after v0.8.29, then committed & pushed everything (user on break, explicitly authorized
push+deploy — pushing `main` also publishes the GitHub Pages site so the user can finally see the site CSS).
- **v0.8.30 — flanking labels are the nudge buttons.** User: the addon's "Raid"/"1:4"/etc. weren't clickable
  and should be (matching the site, where the slider's end labels ARE the buttons). Replaced the separate
  ◂/▸ buttons with clickable labels: "◂ Raid" (nudge toward EHP) + "1:4 ▸" (readout, nudge toward Threat),
  and "◂ HP" / "12.5k ▸" for Min-HP. New `textBtn` helper (base colour, white on hover). `tuneSlider`
  reworked. **Balanced default corrected to 1:1** (v=0) — I'd read the green highlight as 1:1.5; user says 1:1.
- **Site defaults:** left unchanged, confirmed by user (site Balanced is a blend dial, not an independent
  ratio; changing public defaults avoided).
- Verified: JS 150/150, 31-file Lua syntax PASS, zip rebuilt, installed synced. **Still NOT eyeballed
  in-game** (user on break) — on return, `/reload` + confirm the label-buttons click/nudge, arrows render
  (else swap ◂/▸ → ASCII), layout isn't cramped; reload the now-deployed site to see the Min-HP button restyle.

## 2026-07-10 — Slider polish: Min-HP sliders, ◂/▸ nudge buttons, Spell-hit row, preferred defaults (addon v0.8.29 + site)

Punch-list from the user after the tuning sliders landed (screenshot table of their preferred slider stops):
- **Live tab — Spell hit row** under Spell power. `Core.readSheet` now returns `spellHitPct` (Precision
  talent rank + a gear spell-hit-rating scan / 12.62, mirroring `runner.js spellHitPct`); UI shows `x% / 17%`.
  Live min height 404→420.
- **Min-HP sliders exposed** (were hidden gates). Rewrote the Optimize tuning row: each goal now has an
  EHP↔Threat slider AND a Min-HP slider (10k–20k / 500) on one line, each flanked by **◂ / ▸ nudge buttons**
  (`incButton` + generalized `tuneSlider` helper). `UI.goalMinHP` state → `gates.minHealth`. Ratio readout
  compacted to `L:R` (was "EHP x : y Threat") to fit both sliders. Arrows are UTF-8 byte escapes
  (`\226\151\130` / `\226\150\184`) so source encoding is safe — **verify they render in WoW's font**, else
  swap for ASCII.
- **Preferred defaults:** raid 1:4, aoe 1:4, **survival 1:1** (was 1.5:1), **balanced 1:1.5** (was 1:1).
  Min-HP defaults 11.5k/14k/10.5k/12.5k (12.5k so it lands on a 500 step).
- **Site — Min-HP buttons** restyled to match the EHP/Threat end-buttons + given ◂/▸ arrows via CSS
  `::before`/`::after` (pseudo-content survives the JS value rewrites). `web/style.css` only.
- Verified: JS 150/150, 31-file Lua syntax PASS, all 8 parity harnesses PASS (runner_parity still flakes
  intermittently — a JS-optimizer tie-break, unrelated; passes on rerun). Zip rebuilt, installed synced.
  **NOT eyeballed in-game/browser** — user to `/reload` + reload the site.
- **OPEN QUESTION for next session:** should the SITE's slider defaults also move to survival 1:1 / balanced
  1:1.5 to stay consistent with the addon? Left the site defaults as-is (survival 1.5:1, balanced blend-dial
  midpoint) since changing the public tool's defaults is more consequential, and the site's balanced is a
  cross-goal BLEND dial (not an independent ratio like the addon), so "1:1.5" doesn't map 1:1. Ask the user.

## 2026-07-10 — Per-goal EHP↔Threat tuning sliders in the addon (addon v0.8.28)

Follow-up after the v0.8.27 buff work landed and the user confirmed buffs now read right (site-built threat
set flipped 102.09%→102.74% uncrushable with the Live "Assume Kings+MotW" toggle). Next complaint: addon sets
carry less spell power / **spell hit** than the user's site-built sets; they prefer theirs. Tabulated
threat/aoe/survival/balanced (buffed EHP, SP, spell-hit) — addon consistently traded SP+hit for a little EHP.
- **Diagnosis (not a bug):** scoring is a pure dot-product of aggregate stats × the goal's blended scale;
  spell hit IS valued (1.1 in the threat component, above SP's 1.0). The trades come from the **ratios**. The
  real root cause: the addon **hardcoded** goal ratios (raid `ehp:1 threat:2`, survival `2:1`, aoe `1:2`)
  while the **site defaults its per-goal sliders more threat-leaning** (raid v=3 → `1:4`, survival v=−0.5 →
  `1.5:1`, aoe v=3 → `1:4`). So the addon was systematically tankier than the site by default. User (via the
  question tool) chose: **port the site's sliders into the addon** (over bumping defaults or reweighting).
- **Built (v0.8.28):** four EHP↔Threat sliders (one per goal) in the Optimize tab, `v ∈ [−3,3]` step 0.5,
  reusing `web/app.js`'s `ratioFor` math verbatim (verified defaults reproduce the site's ratios exactly).
  Live "EHP x : y Threat" readout per slider. Defaults = site (raid 3 / surv −0.5 / aoe 3 / bal 0); site
  Min-HP floors (11.5k/14k/10.5k/~12.75k) passed as `gates.minHealth`. `UI.Optimize` clones
  `Runner.GOAL_PRESETS` and overrides ratio+minHealth, passes via `optimizeSets`'s existing `goals` option.
  Slider build `pcall`-guarded (OptionsSliderTemplate). Optimize min height 478→582. Footer reworded.
- Verified: JS 150/150, 31-file Lua syntax PASS, ratio-parity check PASS, zip rebuilt (32 files), installed
  addon synced == repo. **runner_parity has a KNOWN nondeterministic flake** (case4 perSlot hands.defGemmed /
  ring2 alternative objDelta) — passed on both re-runs, and it doesn't load UI.lua/Core.lua, so unrelated to
  this change; worth chasing separately (JS optimizer tie-break ordering). **NOT yet eyeballed in-game** —
  user to `/reload`, confirm the four sliders render + drag, the ratio readouts update, and Optimize honours
  them (drag Survival toward Threat → its set gains SP/hit).

## 2026-07-10 — Diagnosed "addon makes different sets than the sim" → Kings+MotW visibility + toggle (addon v0.8.27)

User compared four site-built sets ("my threat/balanced/survival/aoe") vs the addon's Optimize output and
asked why they differ. **Diagnosis (traced through both engines, not guessed):**
- The addon's optimizer **already assumes Kings + MotW** (`UI.Optimize` passes `buff = "raid"` →
  `BUFF_MODE.raid = {kings, MotW}`, identical to the site's default `statBuff`). So "the addon isn't
  assuming buffs" was NOT the cause — that part already matched.
- The confusion came from the **Live readout**: `Core.readSheet` reads the actual in-game character sheet
  (`GetDodgeChance`, `UnitHealthMax`, …), which only reflects buffs physically on the player. It already
  models "Holy Shield up" (checkbox) but **not** Kings+MotW — so a threat set built to be uncrushable *when
  raid-buffed* showed 102.09% (< 102.4%, crushable) while the user stood unbuffed in town. The set was fine;
  the panel just wasn't crediting the buffs. (User's instinct — "gear slightly under, buffs cover the crush
  cap" — is exactly what the optimizer does; the Live panel wasn't showing it.)
- Remaining real set difference (site sets carry a little more spell power) traces to **re-gem**: site
  default = "Re-gem everything"; addon keeps your gems (v0.8.25). User declined a re-gem toggle ("my in-game
  sets are already higher threat with equipped gems").

**Built (v0.8.27):**
- **Live tab "Assume Kings + MotW" checkbox** (default on, mirrors Holy Shield). `Core.readSheet` gained
  `opts.assumeBuffs`: detects which of Kings/MotW are live (`buffActive`, incl. Greater/Gift variants) so it
  never double-counts, reads effective agi/stam/str via `UnitStat`, and adds the buffs to the derived values
  they move — agi→dodge(+armor), stam→health, str→block value; crit immunity untouched. New helpers
  `talentRank` / `liveStaminaMult` (Sacred Duty +3%/Combat Expertise +2%) so the +14 stamina scales like the
  sheet. `withBuffs()` does the strip-Kings / strip-MotW / re-add / re-apply math (verified: unbuffed→both =
  +1.06% dodge, +1030 HP; already-buffed = 0). Live rows start y −32→−50; min height unchanged (fits).
- **Optimize tab "Optimize with Kings + MotW (raid buffs)" checkbox** (default on). Off → `buff = "none"`.
  Cards start cy −56→−76; Optimize min height 458→478.
- `.toc` → 0.8.27. Verified: JS 150/150, Lua wasm parity all PASS, 31-file syntax PASS. **NOT yet eyeballed
  in-game** — user to `/reload` and confirm: (1) the Live "Assume Kings+MotW" toggle flips dodge/EHP/crush by
  the raid-buff amount and makes the site-built threat/aoe sets read uncrushable; (2) the Optimize buff toggle
  changes the sets. Zip rebuilt this session.

## 2026-07-07 — Match the addon's numbers to reality: keep trinkets + keep gems + click-to-copy site link (addon v0.8.23–v0.8.26)

Catch-up handoff for the four version bumps after v0.8.22 (they landed but the SESSION_LOG top entry hadn't
been extended past v0.8.22). All still **uncommitted**; CHANGELOG carries the per-version detail.
- **v0.8.23 — equip-from-bank.** Minimap flyout's click-to-equip now pulls any set piece that's in the bank
  into a free bag slot first (`PickupContainerItem` bank→bag, needs the bank window open), waits a tick, then
  equips; reports how many it pulled and what couldn't fit. (User confirmed equip + resize grip work.)
- **v0.8.24 — "Keep my equipped trinkets" toggle.** `UI.Optimize` was silently forcing the engine's hardcoded
  trinket locks (Icon + Eye); now a default-on checkbox passes your two **equipped** trinkets as the locks
  (unchecked → `{}` = free pick). Closes part of the "sim vs in-game" stat gap.
- **v0.8.25 — keep completed gems/enchants (no re-gem).** The optimizer defaulted to re-gemming, so its numbers
  assumed gems you hadn't applied. Now passes `keepGemsEnchants = { itemIds = <all owned ids>, ignoreCompleteness
  = true }` (engine has no plain "keep everything" flag; all-ids does it). Footer reworded + points to the full sim.
- **v0.8.26 — footer sim URL is click-to-copy (THIS session's finish).** Picking up mid-edit: the previous session
  had *defined* `StaticPopupDialogs["TGS_COPY_URL"]` (copyable-URL dialog) but never wired it — the footer was a
  plain FontString you can't Ctrl+C in-game. Added a transparent button over the footer → `StaticPopup_Show` +
  a "click to copy" tooltip. `.toc`→0.8.26.
- Verified this session: JS 150/150, Lua wasm parity + 31-file syntax PASS, **zip rebuilt** (the working-tree zip
  was stale — didn't match source; `npm run build-addon` refreshed it), installed addon re-synced (UI.lua had
  lagged the repo). NOT yet eyeballed in-game — user to `/reload` and click the footer link + re-check the
  Optimize numbers now that trinkets/gems are kept.

## 2026-07-07 (later still) — Resizable frame + minimap sets button + guided site arrow (addon v0.8.22)

Batch of 5 (2 site, 3 addon):
- **Site — no default trinket on own upload:** already true (`tryParse`→`populateTrinketLocks()` no args;
  only `loadSample` passes `true`). Verified, no change needed.
- **Site — guided step arrow:** `setStep(1|2|3)` toggles `.step-active` on `#input-panel`/`#config-panel`/
  `#results-panel`; an animated `➜` (CSS `::before`) + accent border marks the next panel. Fires: init→1,
  file upload→2, `render()`→3. Reduced-motion respected.
- **Addon — resize:** bottom-right grip (`StartSizing("BOTTOMRIGHT")`), `frame:SetResizable(true)`, size
  persisted in new `TankadinGearSimUI` SV, reused across tabs (clamped up to each tab's min).
- **Addon — no overlap:** Optimize cards now span the pane (`TOPLEFT`+`TOPRIGHT`) with `SetWordWrap(false)`
  (clip, don't wrap) + per-tab `TAB_MIN` via `SetMinResize`/`SetResizeBounds`. Optimize min 470×432.
- **Addon — minimap button (`Minimap.lua`, new, in .toc after UI.lua):** custom draggable minimap button;
  left-click flyout of the optimizer's sets; hover → GameTooltip of per-slot items; click → `equipSet`
  (EquipItemByName per SLOT_INV, pcall'd, combat-guarded, bank items skipped); right-click → Optimize tab.
  `UI.Optimize` onDone calls `ns.Minimap.SetSets(results)`; sets persist in `TankadinGearSimUI.sets`.
- Verified: 31-file Lua syntax PASS, JS 150/150, zip rebuilt (v0.8.22, 32 files), installed == repo.
  **NOT eyeballed in-game/browser yet** — user to `/reload` (resize grip, no overlap, minimap button) and
  reload the site (guided arrow). Equip-from-bank and the minimap drag are the least-tested paths.

## 2026-07-07 (later) — Scrapped the copy box: upload-only (addon v0.8.21)

In-game the Export box showed "Exported 200 items" in the info line but a blank box, and **Ctrl+A/Ctrl+C
copied nothing** — the full ~40KB / 200-line export exceeds what a WoW EditBox will store/render. Confirmed
the exporter itself works (SavedVariables has the full export; small `/tgs debug` text renders fine). User
decision: **drop the copy-paste box entirely, go upload-only.**
- **Addon (`UI.lua`):** removed the ScrollFrame + EditBox + `setExportText`. Export tab now runs the export
  (writes SavedVariables) and shows `/reload`-then-upload instructions (exportInfo status + exportSteps
  FontString). Window 470×260. `/tgs debug` prints to chat and shows its lines in the pane (small = renders).
  `.toc` → 0.8.21.
- **Site (`index.html` / `web/app.js` / `style.css`):** removed the paste `<textarea id="exportText">`; upload
  the SavedVariables `.lua` is the only path (it always worked). `app.js` holds the raw export in a module var
  `exportRaw` (not a DOM field) — captureState/applyState/handleFile/loadSample updated; paste/input listeners
  removed; dead textarea CSS removed; meta/tagline/how-to reworded to "upload".
- Verified: no dangling `exportEdit`/`setExportText`/`exportText` refs, JS 150/150, 30-file Lua syntax pass,
  zip rebuilt (v0.8.21), installed == repo. NOT yet eyeballed in-game/browser — user to reload both.

## 2026-07-07 — Export box STILL blank in-game; real fix + stale-install catch (addon v0.8.19)

User tested in-game: **export box still renders no text.** My v0.8.15 `SetHeight` fix was incomplete and
never eyeballed in-game. Pulled the actual working v0.5.0 code (`git show d4d7cce`) and compared: the v0.5.0
fix had TWO parts and the tab rewrite kept only the height. On the `_anniversary_` client an EditBox child
of a ScrollFrame renders only when given a non-zero height **AND** `SetFocus()` + `HighlightText()` **after
the frame is shown**. Restored both in `setExportText` (both callers already show window + Export pane first;
bonus: auto-selects the text for Ctrl+C). `.toc`→0.8.19; 30-file syntax pass clean.
- **Stale-install catch:** after syncing, `diff -rq` showed the installed `engine/Items.lua` + `Runner.lua`
  DIFFERED from repo — the user's own addon-update had reverted them to older copies, so earlier in-game
  tests ran partly on **stale engine code**. Re-synced the whole folder (`cp -rf`), installed == repo again.
  **Heads-up for next time:** the user's update mechanism lags this repo — after I sync, just `/reload`
  (don't re-run the addon updater), or update from the freshly-built `addon/TankadinGearSim.zip`.
- **Still blank after that (v0.8.20).** In-game `/tgs export` still blank BUT `/tgs debug` shows text — and
  both call the same `setExportText`, so the EditBox renders fine; the export PATH fails before setting text
  (`refreshExport` early-returns on nil `ns.Exporter`, or `Exporter.run()` errors). Made `refreshExport`
  **self-diagnosing**: writes the failure reason (incl. pcall'd Lua error text) INTO the box. Next: user
  `/reload`, open `/tgs export`, and report what the box now says — that pinpoints nil-Exporter vs a run error.
- **Site download was stale — the real "old files" cause.** The site's addon link serves the COMMITTED
  `addon/TankadinGearSim.zip` (GitHub Pages static), last committed at **v0.8.14**; local rebuilds were never
  committed. Fixed for good: `bin/build-addon-zip.mjs` (pure-Node **deterministic** zip — fixed mtimes, sorted
  entries, LF-normalized so Windows/Linux builds match byte-for-byte), `npm run build-addon`, a **pre-commit**
  block (rebuild+stage on any `addon/TankadinGearSim/**` commit), a **CI guard** (`git diff --exit-code` the zip),
  and `*.zip binary` in `.gitattributes`. Committed zip can no longer drift from source. **`release.yml`** (v* tag →
  BigWigsMods packager → CurseForge/GitHub Release) is a separate path and untouched.

## 2026-07-06 — Fix: Export copy box rendered blank (addon v0.8.15)

User picked the addon back up: **`/tgs` gives a blank copy box.** Traced it, and it's a **regression of
the v0.5.0 fix.**

- Bare `/tgs` opens the **Live** tab (no copy box); the blank box is the **Export** tab's `EditBox`.
  Ruled out a data problem: SavedVariables on disk had a healthy 200-item TGS11 export written today
  (`exportedAt = 2026-07-06 21:41:50`), so `Exporter.run()` builds + writes the string fine — the box was
  just not *rendering* it. Also confirmed the installed AddOns copy is **byte-identical** to the repo
  (`diff -rq` clean), so this is live in the current code, not a stale install.
- Root cause: the Export tab's multiline `EditBox` (child of a `ScrollFrame`) had **no height set**. On
  the `_anniversary_` client a 0-height `EditBox`-in-`ScrollFrame` renders **blank** even with text set —
  the exact failure `SESSION_LOG` line ~1354 records being fixed in **v0.5.0** (`d4d7cce`) with an explicit
  `SetHeight`. The **v0.8.0** WeakAura/tab rewrite of `UI.lua` kept the show-before-`SetText` ordering but
  dropped the `SetHeight`. (This is also why we'd been reading exports off the SavedVariables file rather
  than the box — the box never rendered.)
- Fix (`UI.lua`): non-zero default `exportEdit:SetHeight(330)` at build, plus a `setExportText(text)`
  helper that sets text + cursor and grows the `EditBox` to `max(330, (lines+2)*14)` so the scrollbar
  reaches the whole export. Both fill paths route through it: `refreshExport` (Export tab) and
  `UI.ShowDebug` (`/tgs debug`). `.toc` → 0.8.15. 30-file syntax pass + 8 Lua parity harnesses green.

### Web UI discoverability (same session)
Two small website fixes after the addon one:
- **Locked trinkets out of Advanced.** The control sat inside the collapsed *Advanced settings*
  `<details>`, so it was hidden by default — but it's not optional (proc/on-use trinkets the model
  can't score are *forced in*). Moved it into the always-visible **Setup** grid next to Professions /
  Stat buff (`index.html`). DOM-only move; JS still finds `#lockIcon` / `#lockEye` by id.
- **"Change the options ↑" nudge under each set.** Added a `.set-foot` footer link at the end of the
  displayed set (`setCard` in `web/app.js`) that opens the Advanced `<details>` and scrolls up to it,
  so people who don't like a result can find the knobs. New `.set-foot` / `.adv-link` CSS.
- **Bigger "Change the options" callout + scroll target.** Turned the footer link into a prominent
  accent-bordered callout box (bold headline + button-style CTA, `.set-foot*` styles); the CTA now
  expands Advanced **and** scrolls to the top of the whole Setup box (`#config-panel`), not just the
  Advanced block.
- **No trinkets locked by default.** Loading your own gear used to auto-lock `DEFAULT_TRINKET_LOCKS`
  (Icon + Eye of Mag) — a wrong guess forces trinkets you may not own into every set. Now both lock
  dropdowns start at *— none —*; a successful paste/upload scrolls to Setup and **flashes** the
  Locked-trinkets field (`promptTrinketChoice`) so the player chooses first (upload no longer
  auto-optimizes). `populateTrinketLocks(applyDefaults)` — only the **sample** passes `true`, so the
  demo keeps Icon + Eye locked. Share-link restore re-applies saved locks after parse (unaffected).
- Verified: `node --check web/app.js` clean, `<details>` balanced 5/5, **JS 149/149**, stamps
  regenerated. Not yet eyeballed in a browser.

### "Re-gem everything" worse than equipped — shield block-value bug (addon v0.8.16)
User shared two links (same gear/goals, only `keepScope` differs: `off` vs `all`) — "re-gem everything"
gave a worse threat set. Decoded the `#s=` share hashes (gzip+b64url), reproduced both raid sets through
`optimizeSets`. Both pick the **identical 17 items**; the difference is purely gems/enchants:
- **Root cause (fixed):** re-gem rebuilds items from `baseStats` (= `GetItemStats`), which omits a
  **shield's innate block value** (not in the stats table) — same quirk as shield *armor*, which was
  already backfilled. So re-gem lost ~150 block value: repro showed **bv 9 vs 277** vs keep. Fixed by
  backfilling `baseStats.blockValue` from `resolved` in `src/import.js` **and** `engine/Items.lua`
  (parity). New JS test + regenerated `items_fixtures.lua`. JS **150/150**, Lua parity green. `.toc`→0.8.16.
- **Then a real search-suboptimality (fixed, v0.8.17).** After the block-value fix a ~35-SP gap remained,
  all on **legs**: re-gem sat >1% over the crush cap but kept Nethercleft + a +8-def gem because that gem
  held a razor-thin crit margin (5.70% vs 5.6%); flipping legs to Runic Spellthread (+35 SP) alone made
  the set crittable, so the greedy one-piece reclaim couldn't free it. Added a **pairwise (2-opt) relocation**
  after the greedy reclaim (`src/runner.js` + `engine/Runner.lua`): flip a def piece→threat AND a threat
  piece→def, kept only if legal AND `score(agg._raw)` strictly rises (monotonic — can't worsen a set).
  Recovered **+35 SP** (747→782), legs now Runic Spellthread, crit at the 5.6% floor. Regenerated
  `runner_fixtures.lua`; JS **150/150**, all 8 Lua harnesses green (JS==Lua), full solve ~95 ms.
  Gotcha caught mid-fix: first version scored the raw base+delta stats and *lowered* the true objective
  (Kings ×1.10 stamina undervalued) — switched to `agg._raw`, the exact metric the candidate ranking uses.
  Residual ~24-SP gap to keep-mode remains (keep retains more socket bonuses — deeper heuristic limit).
  The ratio slider still maxes at **1:4** (`max="3"`) — extending it is a separate possible lever.
- **Then unique-gem placement (shipped, v0.8.18, +8 SP).** The bulk picker excludes unique/epic gems (can't
  fill every socket), so it never used e.g. Runed Ornate Ruby (+12 SP). Added a greedy, monotonic placement
  pass after the meta pass: `gemSet` gained a `uniqueOverrides` arg (swap a socket's gem, recompute the
  item's gem stats + socket bonus before resolveMetas); the pass places each unique once in the focus socket
  that most raises `score(agg._raw)`, kept only if legal + strictly better. On the user's set: 782→**790**
  (Runed Ornate Ruby on feet, Glowing Tanzanite shoulder, Vivid Chrysoprase chest). Mirrored in Runner.lua
  (tiebreak by pool index for JS↔Lua determinism); regen runner fixtures; JS 150/150, Lua parity green, solve
  ~104 ms. **Correction:** my "~24 SP" for uniques was a bad ceiling (it double-counted duplicate uniques,
  which are illegal — one per character); real legal value is ~8 SP.
- **Remaining ~16 SP = socket-bonus allocation (DIAGNOSED, deliberately DEFERRED).** keep earns the chest
  **+4 defense** socket bonus using Runed Ornate Ruby + Glowing Nightseye + Veiled Noble Topaz (all in-pool,
  color-matched red/yellow/blue) while keeping 22 SD on the item; re-gem's greedy per-socket picker forfeits
  that bonus (3 off-color threat gems, Option A 112.8 > Option B 103.6 locally). Proof it's the lever:
  locking ONLY the chest (keep its gems) jumps re-gem **790 → 803** (of the 16-SP gap, 13 is the chest).
  All keep gems are in-pool, so keep IS reachable — but the +4 def is a *gate stat* whose global payoff
  (free crit margin → threat elsewhere) is invisible to the local Option-A/B decision.
  **Decision (2026-07-07): STOP.** re-gem 790 vs keep 806 is within 2%; the fix is the biggest/riskiest
  change of the session (a `preferBonus` flag + `chaseBonus` set + refactoring reclaim/pairwise/unique into a
  re-runnable `refineGemming()` + a monotonic bonus-chase pass, all mirrored in Runner.lua + fixtures) for
  ~1.6% on one gear set. Left as a tracked TODO — pick up here if socket-bonus retention becomes a priority.

### Pick up here — verify in-game (user)
Re-copy `addon/TankadinGearSim/` into the live AddOns folder (see [[savedvars-disk-path]]), `/reload`,
then `/tgs export` → the box should show the full `TGS11…` string (Ctrl+A, Ctrl+C to copy); `/tgs debug`
should likewise fill. **The D6 Optimize-tab in-game smoke test below is still outstanding** — do it in the
same session.

---

## 2026-07-03 (D6) — In-game optimizer, D6: Optimize tab (addon v0.8.14)

Continued (user: "continue"). **D6 landed (v1, needs in-game verification).** Added the **Optimize** tab
to `UI.lua` — the first user-visible payoff of the whole port.
- Optimize button → `ItemPool.scan()` (owned gear as engine/Items objects, the exact shape `Runner`
  eats) → auto-detect **professions** (`GetProfessions`/`GetProfessionInfo` mapped to our perk names) +
  **faction** (`Enchants.detectFaction` off the worn shoulder) → `ns.Async.optimizeSets({ buff="raid",
  professions, faction })` across frames. Live "Solving N/M…" status from the `onProgress` hook; on done,
  renders the four goal sets as compact cards (name + gate chip; SP / Uncrush% / Crit%; EHP / HP / Avoid /
  Block). Re-clicking cancels the prior run (`optRun.cancel()`).
- Frame widens to 440×366 on the Optimize tab (Live stays 300×404, Export 600×440). Native frames, no
  Ace3 — still loads on a bare folder-copy.
- **Verification status:** all glue over parity-proven code — the item shape flows ItemPool → Runner
  unchanged (validated by runner_parity), so the *engine result* matches the website. The UI layer
  compiles clean (30-file syntax pass) but is **NOT yet eyeballed in-game** (no WoW here). `.toc` → 0.8.14;
  zip rebuilt.

### Pick up here — IN-GAME SMOKE TEST (deferred to next session by the user; do this FIRST)
> Status at end of this session: D6 is committed + pushed but UNVERIFIED in-game. The user said they'll
> test it next session. On resume, start by asking how the in-game Optimize test went (numbers vs the
> website, any Lua errors, layout) before polishing — the UI layer has never run in WoW yet.
- Re-copy `addon/TankadinGearSim/` into the live AddOns folder (see [[savedvars-disk-path]]), `/reload`,
  `/tgs`, click the **Optimize** tab → **Optimize**. Confirm: (1) item count looks right (open the bank
  first for banked gear), (2) professions/faction auto-detected correctly, (3) the solve finishes with no
  client hitch, (4) the four cards' SP/EHP/Uncrush/Crit match the website for the same gear + options
  (buff Kings+MotW, same professions/faction, current phase). If a number's off, reconcile against a
  website run with identical options.
- **Then polish D6:** per-slot gem/enchant/alternative detail in the cards (the data is all in
  `result.perSlot`), and an options row (keep-mode / phase / manual profession + faction override). The
  `/tgs` slash could also gain an `optimize` subcommand to open straight to the tab.
- CurseForge remains the final phase (see addon/PUBLISHING.md; user-only account setup + a dry-run tag).

---

## 2026-07-03 (D5c) — In-game optimizer, D5c: frame-yielding search (addon v0.8.13)

Continued (user: "keep going"). **D5c landed** — the search now runs across frames so a full solve doesn't
hitch the client.
- **Cooperative-yield hook** `ns.engine.onTick` (no-op unless set) called at heavy-loop boundaries in
  `Optimizer.lua` (repair/climb iters, exhaustive top candidates) + `Runner.lua` (each `runGoal`, the
  reclaim + meta-repair loops, each goal in `optimizeSets`). Plus `ns.engine.onProgress(done,total)` per
  goal. Because the hook is nil in the sync path, all 7 existing parity harnesses are UNAFFECTED (re-ran
  green).
- **`AsyncSearch.lua`** (impure): `ns.Async.optimizeSets(items, options, onDone, onProgress, onError)` runs
  `Runner.optimizeSets` in a coroutine driven by an `OnUpdate` ticker with a 12ms/frame budget
  (`debugprofilestop`); the hook yields when the budget is spent, resumes next frame; returns `:cancel()`.
  Compile-checked only (WoW APIs).
- **Soundness proof without WoW:** `test/lua/async_parity.lua` drives `optimizeSets` in a coroutine
  yielding on EVERY tick (maximal churn) and asserts selection/SP/HP/legality == the sync run across all 4
  option sets. Green under wasmoon (8 harnesses total). JS 149/149. `.toc` → 0.8.13; zip rebuilt (31 entries).
- Coroutine yield is safe under Lua 5.1: the whole search stack is pure Lua (no C boundary; we never yield
  inside a `table.sort` comparator — onTick only fires in explicit loops).

### Pick up here (D6 — the first user-visible payoff)
- **D6 — Optimize tab:** wire `ItemPool.scan()` (owned gear → engine/Items objects, already the shape
  `Runner` expects) → `ns.Async.optimizeSets(...)` → render the four goal sets in a new UI tab (reuse the
  Live tab's frame style). Show per-goal: selection (paper-doll-ish), gems/metas/enchant per slot, legal
  gate chips, SP/EHP/HP, buffImpact; a progress bar off `onProgress`. Options UI (professions/buff/faction/
  phase/keep-mode) can start minimal (sensible defaults) and grow.
- **In-game smoke test (do it here):** open bank, `/tgs`, confirm `ItemPool.scan()` sees the same gear the
  exporter does, and an async optimize completes without a client hitch and matches the website for the
  same gear/options.
- Everything still loads on a bare folder-copy (no Ace3) — keep it that way until CurseForge.

---

## 2026-07-03 (D5b) — In-game optimizer, D5b: four-set orchestration (addon v0.8.12)

Continued (user: "push/commit, then continue"). Pushed D4+D5a, then ported the big one:
**`src/runner.js` → `engine/Runner.lua`** — the four-set orchestration.
- `runGoal`: focus/cap gem variants per item → `Optimizer` search → `gemSet` (socket-bonus-aware gemming
  via `GemSolver.planItemGems` + `resolveMetas` meta-aware recolor) → GATE RECOVERY / RECLAIM overshoot /
  FINAL META repair / `nearAlternatives` / libram spellPower-equiv split. `optimizeSets`: buff+scroll
  merge, ctx, `solveGoal` Min-HP floor recovery (max-HP seed + EHP-lean sweep), Balanced end-copy/dual-seed.
- **Determinism:** threaded the D5a `order` array through `gemSet`/meta-pass/near-alts (Lua has no table
  key order), and gave the two JS-stable sorts (`enableMeta`, `nearAlternatives`) an explicit original-
  index tie-break. Result: byte-for-byte selection + gem/plan order parity.
- **Parity:** `bin/gen-runner-fixtures.mjs` runs JS `optimizeSets` over a 25-item synthetic pool (socketed
  pieces incl. a meta socket, Justicar 2pc, a libram, the trinket-lock ids, a keep-lockable neck) × 4
  option sets (raid/kings buffs, professions, faction, useImbuedMeta=false, keepGemsEnchants, maxPhase,
  custom Min-HP goals) → `runner_fixtures.lua`; `runner_parity.lua` deep-compares selection / agg / evald /
  gemChoices / metas / per-slot (gems + enchant + alternatives) / buffImpact. **15 goal results, all
  matched on the FIRST run.** Full Lua suite green under wasmoon (7 harnesses). JS 149/149.
- Wired CI, pre-commit drift guard, `run-lua-parity`, `gen-runner-fixtures` script. `.toc` → 0.8.12; zip
  rebuilt (30 entries).

### Pick up here (D5c → D6)
- **D5c — frame-yielding coroutine:** the search (`Runner.optimizeSets` → `runGoal` → the many `gemSet`/
  `runGoal` recovery calls) is synchronous and can be heavy; wrap it so it yields across frames (e.g. a
  coroutine driven by an `OnUpdate` ticker) so it doesn't hitch the client. `runGoal` is the natural yield
  boundary (4 goals + recovery leans = a handful of heavy calls); a per-candidate yield inside the
  Optimizer heuristic loops is the finer-grained option if 1 goal/frame still stutters. Keep a pure
  (synchronous) `optimizeSets` for the parity harness; the coroutine is an addon-only wrapper.
- **D6 — runner + Optimize tab:** `ItemPool.scan()` → `Runner.optimizeSets` → render the four goal sets in
  a new UI tab (first user-visible payoff). In-game smoke test: confirm `ItemPool.scan()` reads the same
  gear the exporter does (open bank first). ItemPool items already match the shape Runner expects
  (`slot/itemId/equipLoc/stats/baseStats/sockets/socketBonus/gems/enchantId/name`).
- Everything still loads on a bare folder-copy (no Ace3) — keep it that way until CurseForge.

---

## 2026-07-03 (D5a) — In-game optimizer, D5a: optimizer core (addon v0.8.11)

Continued (user: "commit and continue"). Committed D4 (`852d939`), then split the big D5 into bricks and
landed the first: **D5a — the search core** (`src/optimizer.js` → `engine/Optimizer.lua`).
- `buildPool` (slot grouping, paired ring/trinket distinct groups, 2H exclusion, locks), `distinctOk`,
  gate helpers (`gatesPass`/`gateDeficit` — crit + uncrushable + Min-HP), `objectiveFn` (spellPower/ehp/
  'scale' blend), the greedy **repair→climb heuristic**, and the exhaustive solver.
- **Ordering fix for parity:** Lua tables have no key order but the JS search relies on
  `Object.keys(pool)` insertion order (swap tie-breaks) — so `buildPool` returns an explicit `order`
  array every search iterates, and seed picks use a first-max scan (== JS stable-sort `[0]`). Deterministic.
- The `'scale'` objective needs tier set bonuses → ported `src/sets.js`: generated `engine/SetsData.lua`
  (SET_DB / SET_BONUS_STATS) + hand-ported `engine/Sets.lua` (`setCounts`/`setBonusStats`). (Display-only
  `setBonuses` combat-modifier readout deferred to the UI phase.)
- **Parity:** `bin/gen-optimizer-fixtures.mjs` (synthetic pool with strong defensive variants so LEGAL
  sets exist → climb branch + non-nil exhaustive exercised) → `optimizer_fixtures.lua`;
  `optimizer_parity.lua` compares selection / objectiveValue / legality. **52 checks.** Full Lua suite
  **1556 checks** (69+118+126+440+751+52) + 28-file syntax, all green under wasmoon. JS 149/149.
- Wired CI, pre-commit drift guards, `run-lua-parity` PATHS/HARNESSES, `gen-optimizer-fixtures` script.
  `.toc` → 0.8.11; zip rebuilt (29 entries).

### Pick up here (D5b → D5c → D6)
- **D5b — runner orchestration:** port `src/runner.js` (the hard part): `runGoal` (item focus/cap
  variants, `buildPool` + heuristic, gem a SELECTION via `gemSet`/`resolveMetas`, GATE recovery, RECLAIM
  overshoot, FINAL META repair pass, `nearAlternatives`) and `optimizeSets` (buff/scroll merge, ctx,
  `solveGoal` Min-HP floor recovery, Balanced end-copy/dual-seed). Needs GemSolver + Gems/Enchants +
  Model/Evaluate/Scoring + Optimizer + Professions/Scrolls/Librams — everything ported so far ties
  together here. Parity-test the four-set result (selection + gems/metas/enchants + legal) against JS.
  Note `runGoal` uses `optimizeHeuristic(pool, goal, …)` — thread the D5a `order` through (buildPool
  returns it). `resolveMetas`/`reassignForBonus` MUTATE plan choices — port that carefully.
- **D5c — frame-yielding coroutine:** wrap the search so it yields across frames (don't hitch the client).
- **D6 — runner + Optimize tab:** `ItemPool.scan()` → the search → render four goal sets in a new UI tab.
  In-game smoke test: confirm `ItemPool.scan()` reads the same gear the exporter does (open bank first).
- Everything still loads on a bare folder-copy (no Ace3) — keep it that way until CurseForge.

---

## 2026-07-03 (D4) — In-game optimizer, D4: gem/enchant solver (addon v0.8.10)

Continued Phase D (user: "proceed"). **D4 landed** — the gem/enchant recommendation half of the
in-game optimizer, ported from JS and parity-tested.
- **Data (generated):** `gen-lua-data.mjs` now also emits `engine/{GemsData,EnchantsData,
  ProfessionsData,LibramsData,ScrollsData}.lua` from `src/{gems,enchants,professions,librams,scrolls}.js`.
  Added a general nested Lua-literal serializer (`luaValue`) + made `luaKey` emit integer keys as `[n]`
  (so the id-keyed shoulder-faction map looks up by number). Added `nameMatch` (literal lowercase
  substrings) to `src/librams.js` so the port matches libram names without JS regex.
- **Logic (hand-ported):** `engine/{Gems,Enchants,Professions,Librams,Scrolls,GemSolver}.lua`.
  GemSolver is the full `gemsolver.js` (gemWeights, reassignForBonus = Kuhn's bipartite matching,
  bonusEarnedAsTagged, recommendGems/Enchants, planItemGems per-item socket-bonus worth-it, solveLoadout
  incl. the at-cap weight switch through Model/Evaluate).
- **Libram override deferred in D3a now lands** in `engine/Items.build` (mirrors import.js) — referenced
  lazily via `ns.engine.Librams` so Items still loads without the solver. Added libram cases to the items
  fixtures + loaded Librams in `items_parity` so the override is parity-tested where it lives.
- **Parity:** `bin/gen-solver-fixtures.mjs` drives the JS over ~600 inputs → `solver_fixtures.lua`;
  `solver_parity.lua` deep-compares. **751 solver checks**; items 412 → **440**. Full Lua suite now
  **1504 parity checks** (69+118+126+440+751) + 25-file syntax, all green under wasmoon. JS 149/149.
- Wired CI (gen + in-sync diff + `lua5.1 solver_parity`), pre-commit drift guards, `run-lua-parity`
  PATHS/HARNESSES, `gen-solver-fixtures` npm script. `.toc` → 0.8.10; zip rebuilt (26 entries).

### Pick up here (D5 → D6)
- **D5 — optimizer search** in a frame-yielding coroutine (the hard one): port `src/optimizer.js`
  (exhaustive + greedy/repair heuristic, gate checks) and `src/runner.js`'s `runGoal`/`optimizeSets`
  orchestration (goal ratios, gate-aware re-gem, reclaim pass, floor recovery, meta-repair, near-alts).
  It ties together everything ported so far (Model → Evaluate + Scoring + GemSolver). Must yield across
  frames so it doesn't hitch the client. Parity-test the selection against the JS goldens.
- **D6 — runner + Optimize tab** (first user-visible payoff): feed `ItemPool.scan()` → the search →
  render the four goal sets in a new UI tab. **In-game smoke test worth doing here:** confirm
  `ItemPool.scan()` reads the same gear the exporter does (open the bank first).
- Everything still loads on a bare folder-copy (no Ace3) — keep it that way until CurseForge.

---

## 2026-07-03 (later still) — In-game optimizer, D3a: item-object builder (addon v0.8.8)

Continued (user: "keep going"). **D3a landed** — the PURE half of the live item pool: raw
GetItemStats/tooltip reads → structured item objects (`{ slot, stats, baseStats, sockets, socketBonus,
itemId, gems, … }`), mirroring `src/import.js`.
- Exported `STAT_KEY_MAP` + `SLOT_MAP` from `import.js`; `gen-lua-data.mjs` now emits
  **`engine/ItemsData.lua`** (added a string-value map serializer).
- **`engine/Items.lua`** hand-ports `parseItemString`/`mapStats`/`socketsFromStats`/`parseSocketBonus`/
  `build` — incl. shield armor-backfill + base>resolved lift. (Libram effective-stat override deferred
  to D4.)
- Parity: `bin/gen-items-fixtures.mjs` drives `import.js` `parseExport` with synthetic exports (per
  stat-key + per slot + edge cases) → `items_fixtures.lua`; `items_parity.lua` deep-compares. **412
  checks / 26 items.** Full suite now **725 parity checks** + 13-file syntax, all green under wasmoon.
- Wired into CI, `run-lua-parity`, drift guard, `gen-items-fixtures` script. `.toc` → 0.8.8; zip rebuilt.
  JS 149/149.

### D3b done (same session) — live item pool (addon v0.8.9)
Refactored `Exporter.lua` to expose `readItemRaw(link)` (export string byte-identical — factored, not
changed) and added **`ItemPool.lua`** (`ns.ItemPool.scan()`/`bySlot()`): iterates equipped+bags+open
bank, dedupes by item string, `readItemRaw` → `engine/Items.build`, groups by slot. Impure → compile-
checked only (14 files PASS via wasm); real verification is in-game. `.toc` → 0.8.9; zip rebuilt.
**D3 complete** (both halves). Parity still 725 checks.

### Pick up here (D4)
- **D4 — gem/enchant solver:** port `src/gems.js`/`enchants.js`/`gemsolver.js`/`professions.js`/
  `librams.js`/`scrolls.js` + generate their data tables (extend `gen-lua-data.mjs`). This is where the
  **libram effective-stat override** deferred in D3a lands (apply in `Items.build` or the solver).
  Parity-test the gem/enchant planning against the JS. Then **D5** (optimizer search in a frame-
  yielding coroutine — the hard one) and **D6** (runner + Optimize tab; first user-visible payoff).
- Everything still loads on a bare folder-copy (no Ace3) — keep it that way until CurseForge.
- **In-game smoke test worth doing** once D6 exists: confirm `ItemPool.scan()` reads the same gear the
  exporter does (open bank first). No UI hook yet, so nothing to see in-game from D3 alone.

---

## 2026-07-03 (later) — CI + local Lua parity (verify the foundation before D3)

User: "lua-parity check first" (before continuing to D3). Built the verification layer and — for the
first time — actually **ran** the Lua ports.
- **`.github/workflows/ci.yml`:** JS suite → generated-files-in-sync check (regen + `git diff`) →
  `luac5.1 -p` syntax-check of every addon `.lua` → the three parity harnesses under real **lua5.1**.
- **`bin/run-lua-parity.mjs` + `npm run test:lua:wasm`:** runs the same syntax pass + parity locally
  **without native Lua** via `wasmoon` (Lua-in-WASM). Kept `wasmoon` OUT of package.json (repo stays
  zero-dep); the script prints `npm i -D wasmoon` if missing. Installed it here with
  `npm i --no-save --no-package-lock` (node_modules is gitignored) to verify — nothing leaked into git.
- **Bug it caught immediately:** `gen-model-fixtures.mjs` emitted talent-rank keys with spaces as bare
  identifiers (`Sacred Duty = 2`) → Lua syntax error in `model_fixtures.lua`. Fixed with a `luaKey`
  helper that bracket-quotes non-identifiers (`["Sacred Duty"] = 2`). CI would've caught it on push;
  local run caught it now.
- **Result: all green** — syntax PASS (11 addon files, incl. Core/UI/Exporter compile clean) + **313
  parity checks** (eval 69 + scoring 118 + model 126). So D1+D2 ports are verified against the JS
  goldens, not just eyeballed.

Note: wasmoon is Lua 5.4 (WoW/CI is 5.1) — fine for arithmetic parity + syntax; CI's lua5.1 is
authoritative. No `.toc` bump / zip rebuild (only CI + tooling + a test-fixture fix changed; nothing
shipped in the addon).

### Pick up here (D3) — unchanged from below, now on a verified base
- **D3 — live item pool:** refactor `Exporter.lua`'s owned-item reads into structured item objects
  ({ slot, stats = { STAT_KEYS... }, sockets, name }) that `Model.aggregate` consumes (replaces the
  website's `import.js`). Add a `*_parity`-style guard where it makes sense. Then D4 solver, D5 search
  (frame-yielding coroutine), D6 runner + Optimize tab.

---

## 2026-07-03 — In-game optimizer, D2: forward model (addon v0.8.7)

Continued Phase D (user: "what's next… continue"). **D2 landed** — the forward model that turns a
hypothetical item selection into the sheet stats `evaluateSet` eats (the optimizer's scoring input;
the Live readout still reads finals off the sheet, so this isn't wired to any UI yet).
- `bin/gen-lua-data.mjs` now also emits **`engine/CharacterData.lua`** (CHARACTER/TALENTS/BUFFS/
  STAT_KEYS from `src/model.js`) — added a `luaArray` helper for STAT_KEYS.
- **`engine/Model.lua`** hand-ports `aggregate`/`talentsFromRanks`/`sumStats` (Kings ×1.10 after flats,
  Toughness item-armor, Strength/20 block value, Imp-RF damageTakenMult). Loads after CharacterData
  (needs it + Constants).
- Parity: `bin/gen-model-fixtures.mjs` → `test/lua/model_fixtures.lua`; runner `model_parity.lua`.
- Pre-commit guard: regen CharacterData.lua + model goldens on `src/model.js`. `gen-model-fixtures`
  npm script. `.toc` → 0.8.7; zip rebuilt. JS suite 149/149.

**Still no Lua interpreter here** → eval/scoring/model parity harnesses are unrun locally. Port is a
direct 1:1 of model.js (re-checked every field + RATING key by eye); base fixture sanity-checks by hand
(defenseSkill 370 = 350+20 Anticipation, health 4612.2, blockValue 6). Verify under CI / a Lua box.

### Pick up here (D3)
- **D3 — live item pool:** refactor `Exporter.lua`'s owned-item reads into structured item objects
  ({ slot, stats = { key=val }, sockets, name }) that `Model.aggregate` can consume — replacing the
  website's `import.js` string parse. The Exporter already scans equipped+bags+bank, so most of the
  gather exists; the work is mapping tooltip/GetItemStats reads → the STAT_KEYS stat block per item and
  grouping by slot. Then D4 (gem/enchant solver), D5 (search in a frame-yielding coroutine), D6 (runner
  + Optimize tab).
- Everything still loads on a bare folder-copy (no Ace3) — keep it that way until the CurseForge phase.

---

## 2026-07-02 (night) — Addon v0.8.5: Live readout reacts to buffs

User (after approving the reskin): "armor dr, ehp, block chance doesn't change when i buff righteous
fury or cast hs." Diagnosed three things in `Core.lua`:
- **Root cause for all of it:** the refresh frame listened for gear/stat events but **not `UNIT_AURA`**,
  so nothing recomputed when a buff/aura changed. Registered `UNIT_AURA` (player).
- **Block/Crush now move on a live HS cast.** v0.8.2 made block state-independent (strip live HS to
  base, re-add only when the toggle was on) — correct against double-counting but it meant casting HS
  did nothing. Changed to apply the bonus when **`hsActive OR toggle`**: casting HS moves Block+Crush
  live (toggle off), the toggle still previews when HS is down, and it still can't double-count.
- **EHP now reflects Improved Righteous Fury.** Detect the live RF aura (`buffActive`) + talent rank
  (`impRighteousFuryRank` via GetTalentInfo) → `damageTakenMult = 1 - 0.02*rank` while RF is up; folds
  into physical EHP in evaluateSet (~+6% at 3/3). **Armor DR is correctly unchanged by RF/HS** (armor
  only) — explained to the user, not a bug.
`buffActive` helper shared by HS + RF checks. `/tgs debug` prints RF/rank/damageTakenMult. `.toc` → 0.8.5;
zip rebuilt.

**Verified in-game** (user): numbers now change in realtime with buffs. RF discrepancy vs the WeakAura
reconciled — with RF up, TGS EHP +6.38% (26038→27700) vs WA +11.11% (→28931). `/tgs debug` confirmed
`impRF rank=3, damageTakenMult=0.940` → TGS is on the textbook 3/3 = 6%; the **WeakAura over-counts**
by ~4% (its 10%), probably folding a magic-only reduction (Spell Warding) into physical EHP. **TGS
correct, no engine change.**

**v0.8.6 follow-up:** `/tgs debug` now dumps into the **Export copy box** (`Core.debug()` returns the
text; `UI.ShowDebug` opens the Export tab with it) so it's Ctrl+C-able, not just printed to chat.

Watch: GetTalentInfo name-match "Improved Righteous Fury" is enUS-only (fine for the user); the
resilience gear-scan re-runs on each coalesced UNIT_AURA tick while the window's open — cheap
(1/frame, only when shown) but a candidate to cache (rescan only on equipment change) if perf bites.

---

## 2026-07-02 (evening) — Addon v0.8.3: Live tab reskinned to the WeakAura look

User direction: **reskin the Live readout to look like the Tankadin II WeakAura** (compact colored
stat-stack) keeping TGS's black background, **then** build the in-game optimizer, **CurseForge last**.
Did the reskin in **native frames** (chosen option 3 — no Ace3 yet, so the folder-copy dev loop keeps
working; styling carries into the eventual Ace3 port).

`UI.lua` Live pane rewritten from the wide two-column table into a compact vertical stack: gold labels
(`GOLD`), cyan values (`CYAN`), grouped Avoidance (Miss/Dodge/Parry/Avoid/Block) · Caps (Crit + a dim
heroic line + Crush) · Mitigation (Block value/Armor/Armor DR/EHP·HP) · Throughput (Spell power). New
`statRow` helper (label x14, value x118); pass/fail uses the built-in `ReadyCheck-Ready`/`-NotReady`
textures (`mark()`) + green/red value color; crush/crit rows show `value / threshold`. Avoid =
`e.actualAvoidance` (miss+dodge+parry); Block = `blockPctEffective`. Window is now **narrow (300×404)
on Live**, widens to 600×440 for Export (via `UI.Select`). `.toc` → **0.8.3**; zip rebuilt.

**Not verified in-game** (no WoW here) — the user will eyeball it. Watch for: the bottom note crowding
the Spell-power row (height padded to 404 + note shortened to one line), and whether the ready-check
`|T…|t` icons render inline at the chosen `:0` size. If layout's off, nudge row pitch (17) / window
height. Lua syntax not machine-checked (no luac locally); reviewed by eye, all `liveRows` keys are set.

### Pick up here
- CurseForge is explicitly **last** (pipeline already scaffolded in Phase B part 1; needs the user's CF
  account setup + a dry-run tag — see `addon/PUBLISHING.md`).

---

## 2026-07-02 (night) — In-game optimizer, D1: scoring core (addon v0.8.4)

Started Phase D (in-game optimizer). Agreed sub-phase plan (in the CHANGELOG/handoff):
**D1 scoring core → D2 forward model (aggregate) → D3 live item pool (refactor Exporter reads) →
D4 gem/enchant solver → D5 search in a frame-yielding coroutine → D6 runner+UI (Optimize tab).**
Each parity-tested against JS goldens.

**D1 landed** (internal scaffolding — loads in the .toc, no UI wired yet):
- `bin/gen-lua-data.mjs` now also emits **`engine/Weights.lua`** (ZERO/SCALES/PARTS from
  `src/weights.js`) via a nested Lua serializer — scales stay single-sourced in JS.
- **`engine/Scoring.lua`** hand-ports `score`/`scoreByScale`/`contributions`/`blendScale`.
- Parity: `bin/gen-scoring-fixtures.mjs` → `test/lua/scoring_fixtures.lua`; runner
  `test/lua/scoring_parity.lua` (block×scale scores, blendScale tables, blend-then-score).
- Pre-commit drift guard extended (regen Weights.lua on weights.js; regen scoring goldens on
  weights/scoring changes). `gen-scoring-fixtures` npm script added. `.toc` → 0.8.4; zip rebuilt.

**Couldn't run the Lua parity locally** — no `lua` interpreter on this box (checked PATH, scoop, choco,
localappdata). The scoring logic is a trivial dot-product + blend and the data is machine-generated, so
confidence is high, but the two Lua harnesses (eval + scoring) are **unrun here** — verify under CI or
a machine with Lua (`lua test/lua/scoring_parity.lua` / `eval_parity.lua`). JS suite 149/149.

### Pick up here (D2)
- **D2 — forward model:** port `src/model.js:aggregate()` (sum a selection of items → the sheet stats
  `evaluateSet` eats, incl. Kings+MotW buff handling: flat then ×1.10 — see [[buffs-kings-motw-stack]]).
  Add `engine/Model.lua` + parity fixtures (feed item selections, compare aggregate output). Then D3
  reads owned gear live (refactor `Exporter.lua`'s item reads into structured item objects — the
  Exporter already gathers equipped+bags+bank, so most of the scan exists).
- Keep everything loading on a bare folder-copy (no Ace3) until the CurseForge phase.

---

## 2026-07-02 (later) — Addon v0.8.2: real crit fix + Holy Shield/libram accuracy

Second in-game test of the Live tab (user, Libram of Repentance equipped, two screenshots: HS
off/inactive and HS on/active — `...\wow-tbc\screencaps for testing\tgs in-game discrepancy {no hs,with hs}.png`).
Two bugs, both in `Core.lua`; `engine/*.lua` untouched so the 69/69 parity harness is unaffected.
Bumped `.toc` → **0.8.2**. CHANGELOG updated.

1. **Still crittable** (5.20% shown vs the WA's 5.88% → the exact ~0.68% = ~27 resilience gap). The
   v0.8.1 fix read resilience via `GetCombatRating(CR_CRIT_TAKEN_*)` with a `GetCombatRatingBonus`
   fallback — but on Anniversary **both return 0**, so resilience was still dropped. Fix: sum resilience
   off equipped gear with `GetItemStats` per slot (slots 1–18, keys `ITEM_MOD_RESILIENCE_RATING[_SHORT]`;
   the item link carries socketed gems). Combat-rating reads kept only as a fallback when that API is
   missing.
2. **Holy Shield double-counted + block libram.** `GetBlockChance()` already reflects a *live* HS aura
   (+30%) **and** the Libram of Repentance's HS-conditional +42 block rating. Confirmed by arithmetic on
   the screenshots: base 24.79 + 30 (HS) + 5.33 (libram) = 60.11 = the live block. The addon then added
   another +30 → **134.07% / "+31.67%"** uncrushable when reality (and the WA) is **104.07% / +1.67%**.
   Fix: detect the live HS aura (`AuraUtil.FindAuraByName`/`UnitBuff` scan) and the equipped block libram
   (`BLOCK_LIBRAMS = {[29388]=42}`, relic slot 18), strip both out to a HS-free `baseBlock`, and re-add
   the assumption once (`hsBonusFull = 30 + libram/blockPer1`). Now the with/without-HS numbers are
   **state-independent** (same result whether HS is up in-game or only assumed), and the "assume HS up"
   toggle credits the libram even when HS is down. Avoidance row shows the effective (HS-inclusive) block
   so it matches the WA's 60.11. `/tgs debug` now also prints gear-scanned resilience, live-HS state,
   libram rating, and base-vs-effective block.

### Verified in-game (user, 2026-07-02)
- **Confirmed correct.** User re-tested the Live tab and the stats now read right — crit reads
  uncrittable and the crush table no longer double-counts Holy Shield. Both v0.8.2 fixes are good
  in-game; the `GetItemStats` resilience path works on the Anniversary client (the earlier risk about
  the resilience key is resolved — no tooltip-scan fallback needed).

### New feature backlog (user request)
- **Skin the Live readout like the Tankadin II WeakAura** shown beside TGS (that compact stat-stack
  look — colored labels, tight rows), but keep TGS's current **black background**. Cosmetic reskin of
  the Live pane in `UI.lua`; fold into the Phase B Ace3 UI work rather than polishing the native frames
  twice.

---

## 2026-07-02 (later still) — Phase B part 1: CurseForge release pipeline

Committed the v0.8.2 fixes (`e175d66`), then moved to the next plan item (Phase B, `snappy-forging-knuth`).
Built the **distribution pipeline only** — deliberately NOT the Ace3 UI swap — so the current
native-frame addon keeps loading on a plain folder-copy (the user's in-game test loop). New files:
- **`.pkgmeta`** (repo root): `package-as: TankadinGearSim`, `move-folders: {TankadinGearSim: addon/TankadinGearSim}`
  + an `ignore` list covering the whole web project, so the packager emits a clean `AddOns/TankadinGearSim/`.
  Ace3 `externals:` block is present but **commented out** (enable when UI.lua goes Ace3).
- **`.github/workflows/release.yml`**: BigWigsMods/packager on `v*` tags; `permissions: contents: write`;
  `CF_API_KEY` + `GITHUB_TOKEN` env. Skips CF upload gracefully if the secret is absent.
- **`.toc`**: `X-Category/X-License/X-Website`; project-id line left commented (`# ## X-Curse-Project-ID`).
- **`LICENSE`** (MIT, matches package.json) and **`addon/PUBLISHING.md`** (the user-only CF steps + release flow).
- Updated `addon/README.md` with a Releasing section.

**Not yet verified** (can't be, locally): the `.pkgmeta` `move-folders`/`ignore` recipe and the
workflow only truly prove out via a **packaging dry run** — the plan's verification step. That needs a
`v0.8.2-rc1` tag pushed (produces a GitHub Release zip even without CurseForge configured). Confirm the
zip extracts as `AddOns/TankadinGearSim/` with `.toc` + `engine/` + the `.lua` files, no stray repo dirs.

### Pick up here
- **User-only (blocks CurseForge publish):** create the CF project, uncomment+set `## X-Curse-Project-ID`,
  generate a CF API token, add it as the `CF_API_KEY` GitHub secret (all in `addon/PUBLISHING.md`).
- **Dry run:** push a `v0.8.2-rc1` tag and check the Actions run + the produced zip layout. Adjust the
  `.pkgmeta` ignore/move recipe if the packager includes stray top-level dirs.
- **Decision pending — Ace3 timing.** Deferred here to protect folder-copy testing. When we do port the
  UI, that's when the WeakAura reskin lands and the `.pkgmeta` externals get uncommented.

---

## 2026-07-02 (end of day) — Phase C part 1: constants generator + drift guard

Did the next non-blocking plan item while the user was away (they didn't answer the Ace3-vs-Phase-C
sequencing question, so I took the no-risk path that keeps folder-copy testing intact).
- **`bin/gen-lua-data.mjs`** (`npm run gen-lua`) imports `src/constants.js` and regenerates
  `addon/TankadinGearSim/engine/Constants.lua` — JS is now the single source of truth for the addon's
  DATA. Verified **idempotent** (two runs byte-identical) and that it reproduces the old hand-stub's
  values exactly (only cosmetic diffs: comment alignment, `1.10`→`1.1`, `2.0`→`2`, multiline CRIT_MULT).
- The two helper **formulas** (`ARMOR_CONST`/`RESIST_DENOM`) are emitted from a fixed template (logic,
  not data) — guarded by the existing Lua parity harness, not the import. A `COMMENTS` map in the
  generator carries the guide-reference comments (cosmetic; values always come from the import).
- **Drift guard:** extended `scripts/githooks/pre-commit` (live via `core.hooksPath`) to re-run the
  generator and stage `Constants.lua` whenever `src/constants.js` or the generator is committed — same
  pattern as the asset-stamp step. Added the `gen-lua` npm script.

Couldn't run the Lua parity harness locally (no `lua` binary on this box), but values are unchanged so
`test/lua/eval_parity.lua` (69/69) is unaffected. JS suite untouched.

### Pick up here (updated)
- Still owed: the **Ace3 UI + WeakAura reskin** (needs the user's go-ahead — it ends the bare
  folder-copy dev loop) and the **CurseForge dry run + account setup** (user-only, above).
- **Phase D / later Phase C generators:** when the optimizer port starts, extend `gen-lua-data.mjs`
  with `GemsData.lua`/`EnchantsData.lua`/`BisItemsData.lua` (the generator is structured so that's an
  additive change), and run the optimizer in a frame-yielding coroutine.

---

## 2026-06-30 (later still) — Socket-bonus free-forfeit fix (post-crash resume)

Resumed after a PC crash; working tree was clean (nothing lost — batch 7 committed at `191e677`).
Owner did the browser eyeball pass on `feature/results-ui-improvements` (localhost:8000) and flagged
**one bug**: the chest (Justicar Chestguard, R/Y/B sockets, +4 Def bonus) showed gems
`Glowing Nightseye, Veiled Noble Topaz, Veiled Noble Topaz` with "✕ Socket bonus skipped — not worth an
off-color gem", but those three gems (purple + 2×orange) *can* fill R/Y/B (Nightseye→blue, Topaz→red,
Topaz→yellow), so the bonus was **free**.

Root cause: `bonusKept` checked whether each gem fit the socket it was *tagged* to, not whether the gems
could be *assigned* to fit (the player controls placement). The **meta recolor** (`resolveMetas` in
runner.js) recolors specific sockets to satisfy a meta's color requirement and can leave a hybrid tagged
to an off-color socket while a sibling that fits it sits elsewhere — a mislabel that forfeited an earnable
bonus. (Note: the *on-disk* export never triggers it — swept every goal × slider × prof × meta and found
**0 free forfeits** — so the owner's screenshot came from a different loaded export or a stale pre-fix
browser bundle. Fix is defensive against the real code path regardless. If it recurs, hard-refresh first.)

Fix (`src/gemsolver.js` + `src/runner.js`): new **`reassignForBonus`** (Kuhn's bipartite matching, ≤4
sockets) finds the max-fit gem→socket assignment, **relabels** each gem's `.socket` so the readout shows
the earning layout, and returns whether all sockets match. New **`bonusEarnedAsTagged`** is a faithful
proxy for "was the bonus already banked into set stats" (planItemGems only banks it when it fills by
color) — so a bonus the relabel *newly* earns is credited to `added` (free mitigation), while an
already-earned one isn't double-counted. Reassignment only ever earns, never loses, so legit forfeits
(3× orange → no blue-fit) stay skipped. Also applied in `nearAlternatives` (display-only). The existing
`bonusKept === allFit` invariant (test/gem-socket.test.js) still holds *because* we relabel.
`test/socket-bonus-reassign.test.js` added. Suite 143→**149/149**. CHANGELOG updated.

Owner approved and this was **merged to `main` and pushed** (`bf63764`, fast-forward — main was 0 behind,
so all 8 review commits + this fix deployed together).

**Follow-up (same session): deterministic cache-busting for the whole module graph.** Noticed the stamp
(`bin/stamp.mjs`) only fingerprinted `web/app.js` + `web/style.css`, but those import all of `src/` via
un-versioned relative ES imports — so an engine change could serve a stale `src/` file from browser cache
after deploy (likely why the owner's screenshot showed pre-fix behavior). Rewrote the stamp to crawl the
module graph from `web/app.js` and emit a content-hashed **`<script type="importmap">`** into index.html
(between `importmap:start/end` markers): each module → `?v=<hash>` URL. Import maps normalize relative
specifiers to absolute URLs before matching, so `app.js`'s `../src/runner.js` remaps to the versioned URL
with **no source-import rewriting and no per-file cascade** — only index.html changes. Pre-commit hook
now re-stamps on any `src/|web/` `.js`/`.css` change (was app.js/style.css only). Stamp is CRLF-preserving
and idempotent; verified all 19 mapped URLs serve 200, JSON parses, editing a src file flips only its
hash. Import-map support: Chrome 89+/FF 108+/Safari 16.4+ (2021–2023). Non-breaking even if unsupported
(host ignores the `?v` query → same file). CHANGELOG updated.

### Pick up here
- On `main`, deployed. If pulling the module-map change, no action needed — future engine commits
  auto-stamp. The very first deploy of index.html itself still revalidates via GH Pages ETag (~10 min) or
  a hard-refresh; after that every module is content-addressed.
- Remaining browser eyeball items from the prior session still stand (accordion, badges, Miss row,
  spell-hit/armor tooltips, mobile column).

---

## 2026-06-30 (later) — Results-page UI batch on a review branch

New workflow (owner instruction): **build ideas on a branch, never directly on `main`** (main deploys
to the live site); commit each idea so work is saved, but leave merging to the owner after review. This
session's work lives on branch **`feature/results-ui-improvements`** (NOT merged). See memory
`workflow-build-on-fork`.

Six results-page features (suite 136/136 green; both web JS files `node --check` clean):

1. **Curated community BiS per slot** — new `web/bis.js` (per-phase 1–5, per-slot top-3), extracted from
   Wowhead's Prot-Pala-Tank BiS sub-guides via a scratchpad scraper (`extract_bis.py`): map item IDs →
   names from the embedded `g_items` JSON, walk `[h3 toc="Slot"]` sections, keep `[item=ID]` whose
   `slotbak` (invtype) matches the section. **Two scraper bugs fixed**: missing slotbak 16 (cloak left
   `back` empty), and a window bleed where items with no `jsonequip` (gems/scrolls/currencies) inherited
   the next item's slotbak — bounded each window to the item's own entry. Wired into the slot `<details>`
   as a "Phase N BiS" block (owned/in-set tagged). Phase select renamed **Content phase**, extended to
   1–5, re-optimizes live on change.
2. **Worn vs swap badges** — `● worn` / `swap in` (+ faint blue edge) from `it.equipped`.
3. **Pin → Equip** rename (button, pinned state, "Unequip all"). Worn badge intentionally says "worn"
   not "equipped" to avoid colliding.
4. **`needs re-gem`** is now a dotted `<abbr>` tooltip (help cursor, fuller text).
5. **Open Sixty Upgrades ↗** link beside the export button.
6. **Armor** stat hover shows % physical mitigation (`.tip` class — no logic-panel jump).

**Second batch on the same branch** (owner review notes; suite 136/136 green):
- Slot dropdowns now behave as an **accordion** (opening one closes others) — wired in `render()`.
- **Owned BiS items are equippable** (equip button → pin); unowned show "not in your bags". `bisHTML`
  now takes `goalId` and supports a per-entry `note` (ⓘ tooltip).
- **Tome of Fiery Redemption (30447)** hand-added to P1–P2 trinket BiS with a note (on-use proc the model
  can't score, but beats Eye of Magtheridon on threat). Manual additions are documented at the top of
  `web/bis.js`.
- **Spell-hit cap tooltip** (summary header + per-set Spell panel) and a **Miss row** in the Defense
  panel (between Block and Dodge), using `missChance()` from `combat.js`.

**Batches 3–6 (autonomous, owner asleep — "keep updating the fork till out of tokens"):**
- **3** — BiS shown on empty slots; `test/bis-data.test.js` integrity guard (suite → 140/140).
- **4** — BiS header tooltip (reference-only/source); empty slots dim only the label so the BiS dropdown
  stays readable.
- **5** — "How the sim works" §7 updated: "Pin"→"Equip", documents the community-BiS list.
- **6** — mobile (≤760px) un-mirrors the new right-column elements (worn/swap badges, BiS rows, swapped
  edge accent).

Self-reviewed the interlocking render path (`slotHTML`/`slotDropdown`/`bisHTML`): note text is
quote-safe for `title=`, `chosenId===null` (empty slot) falls through correctly, accordion + Wowhead
refresh don't conflict. Stopped here deliberately — remaining ideas would be speculative features better
done with owner direction. All on `feature/results-ui-improvements`; **`main` untouched / not merged.**

**Batch 7 — equip not-owned BiS items (planning aid):** owner asked to make BiS items not in the
bag/bank equippable. New generated `web/bis-items.js` (stat block + sockets for all 133 BiS items, from
the same Wowhead `jsonequip`; socket enum 1=Meta/2=Red/3=Yellow/4=Blue; `blockamount`=block value,
`mlehitrtng`=hit). app.js builds a synthetic owned-style item (`buildSyntheticItem`, librams via
`libramStats`), folds `virtualItems` into the optimizer pool (`optimizerPool()`), pins it, and shows a
"+ add to sim" button on not-owned BiS rows, a ★ planned badge, and an "Added for planning" banner
(captured in share links as `vi`). `test/bis-equip.test.js` runs a synthetic item through the real
optimizer. Socket bonus not modeled for planning items (unresolved Wowhead id). Suite 143/143.

### Pick up here
- **Owner review** the branch (7 commits: `bde06f1`→HEAD), then merge to `main` when happy (merge =
  deploy). Pre-commit asset hook re-stamps `index.html` cache-bust hash on commits touching `web/`.
- **Browser eyeball still owed**: BiS Wowhead links iconize, dropdown summary reads
  "≈ N also viable · BiS list", accordion closes siblings, swap/worn badges + Miss row + spell-hit/armor
  tooltips read right, mobile single-column looks clean.
- Wowhead lists are "the best found" but the owner considers them mediocre — revisit BiS source later if
  a better one appears. Manual BiS additions go at the top of `web/bis.js` with a `note` (see Tome of
  Fiery Redemption, P1–P2 trinkets).
- Local review server: `python -m http.server 8000` from repo root → http://localhost:8000/.

---

## 2026-06-30 — Item-link iconization + collapsible alternates (web polish)

Two web/UI features finished and verified against the suite (136/136 green). Sitting **uncommitted** in
`web/app.js` + `web/style.css` (the Wowhead `<script>` config already landed in `index.html` with the
share-link commit `6d66793`).

- **Wowhead link iconization.** `render()` now calls `whRefresh()` → `$WowheadPower.refreshLinks()` after
  each dynamic render so item links (`/tbc/item=<id>`) get icons, quality colors, names, and hover
  tooltips. power.js only scans on load; our results render later, hence the post-render re-scan. Retries
  8× / 400ms until the deferred script is ready, then it self-scans.
- **Collapsible "also viable" alternates.** Per-slot near-ties moved from an always-open `<div>` to a
  collapsed `<details>`/`<summary>` ("≈ N also viable"); expanding shows each alt + gems + pin/exclude.
  Marker flips ▾/▴; row-reverse on right-hand paper-doll slots.

### Pick up here
- **Commit** the two files when ready (not yet committed — awaiting owner go-ahead). CHANGELOG updated.
- Worth an in-browser eyeball: confirm icons actually appear (needs network to `wow.zamimg.com`) and the
  dropdown summary aligns on both left/right slot columns.

---

## 2026-06-29 — UI/UX + marketing pass (branch `feature/ux-marketing-improvements`)

Ran a UI/UX review agent + a marketing review agent over the web app; distilled a prioritized
improvement list (sample-first onboarding, fix "feels-broken" first impression, tame the Setup panel,
jargon tooltips, separate Balanced, shareable links, credibility/math page, searchable name). Building
on a branch in that order; the name change is held for the owner's decision.

Shipped so far (commit on branch):
- **Sample-first onboarding (#1).** "Your gear" leads with "▶ Try it with a sample character"; loading
  the sample or uploading a file auto-optimizes and scrolls to results. Addon how-to + paste/upload moved
  into a collapsed "Use your own gear" disclosure. A "Use my own gear →" CTA shows under the demo results
  (sample-only, toggled by `loadedSample`) and opens that disclosure.
- **First-visit polish (#2).** Slider end labels are ◂/▸ pill buttons; goal sliders re-optimize as soon
  as gear loads (`scheduleLiveUpdate` guard relaxed to require only `items`); Faction + trinket selects
  disabled with "Available after you load gear" until `tryParse`/`populateTrinketLocks` enable them.
- **Survival floor-recovery dip (engine).** `optimizeSets` recovery branch now seeds candidates from the
  live `gseed` (previous set) when present, else the max-HP seed — removing spurious SP dips on live
  survival drags (verified with a sweep sim: floors 12k/13k went 2–3 dips → 0). Default 14k floor is
  near-inert for the sample (max HP ~14.7k, little slack). One residual decline at ~12.5k floor is a real
  tradeoff (threat gems sink HP), not an artifact — a continuation guard was tried and removed as useless.

- **Setup decluttered (#4 + #8).** Setup shows only Professions + Stat buff + a "defaults are fine" hint;
  Gem phase / Faction / Locked trinkets / Scrolls / Talents moved under a collapsed "Advanced settings
  (optional)" `<details>`. "Keep gems & enchants" split out of the Stat-buff field into its own "Gems &
  enchants" field, imbued-meta checkbox grouped with it. IDs unchanged → no app.js change.

- **Glossary tooltips (#3).** `term(label, key)` helper + GLOSSARY map in app.js wrap EHP / Uncrittable /
  Uncrushable / Min HP / def-gemmed / kept in `<abbr class="term" title=…>` (dotted underline, help
  cursor) across the summary table, gate badges, Survival panel and slot tags. A delegated click handler
  opens `#logic-panel` details and scrolls to it.

- **Balanced dial polish (#9 + tester fixes).** Balanced row separated (full-width, divider, gold name,
  caption); slider halved to 24 increments (`step` 0.125→0.25); `fmtMinHp` shows "off" at the 10k floor.
  Engine fixes for tester reports: Balanced live-seeding broke end reproduction (climbed from its own
  blend, stuck in a local optimum) → at an exact end (ratio+floor == Raid/Survival) it now COPIES that
  end's already-solved result (`{ ...byId[endId], goal: g }`), path-independent; between ends it dual-seeds
  (self + nearer-end) and keeps the higher-scoring. `optimizeSets` map refactored: per-goal solve pulled
  into `solveGoal(g, gseed)`, results accumulated in `byId` so Balanced can reference Raid/Survival.

- **Tester SU spell-damage gap → libram display fix (option B).** BulkAggro export: sim threat set read
  669 SP, SU import showed 634 (gap 35). Audited summation against the export header's in-game scan: SP
  sums EXACTLY (637=637), so not a sum bug. Root cause: Libram of the Eternal Rest is modeled as +35
  EQUIVALENT spellDamage (its Consecration effect) for threat scoring, and that leaked into the displayed
  Spell Damage; SU sees the raw libram (no tooltip SP) → 35 lower. Fix: engine exposes
  `agg.spellPowerLiteral`/`spellPowerEquiv`/`spellPowerEquivSource` (runGoal computes equiv via
  `libramStats` over the selection); web shows literal SP in summary + Spell panel and surfaces the
  equiv separately ("Relic effect (≈SP) +N" + a "+N" chip in the summary). Objective uses full agg._raw,
  so selection unchanged. Verified: full = literal + equiv (637 = 602 + 35 with the libram forced).

  NOTE: my local runs of the tester's settings produce a DIFFERENT set than the tester (649/637 vs their
  669, and my optimizer picks the block libram not the threat libram) — likely a version/determinism
  difference worth chasing. The libram split itself is verified on the tester's actual relic.

RESOLVED — the stamina/block "discrepancies" vs the in-game scan are NOT summation bugs; do not change
baseStamina/baseBlockPct (it would break sheet-parity). The addon header scans the LIVE BUFFED character
sheet; the sim models unbuffed gear. Proof across two characters: spell power matches the scan EXACTLY
(no buff adds SP) — tester 637=637, sample 811=811. Tester scan: STR/AGI/INT match exactly, only STA +35
(a lone stamina buff active during scan). Sample scan: STR/AGI/INT/STA all inflated (full Kings+MotW+
Fortitude → STA −162). Block +5.3%: the Libram of Repentance's +42 block rating (Holy-Shield-conditional)
— 26.19 computed without it vs 26.17 scanned, exact. The sim assumes HS up (correct for tanking, and the
uncrushable gate consistently assumes HS up); the idle paper-doll scan omits it. hsBlockBonus is always
30 (the "35.32 w/ block libram" is a stale comment, nothing sets it — no double-count). Net: summation
verified accurate; the only real bug was the libram SP display (fixed, option B above).

- **Tester: crushable raid threat set (hard-gate violation) — FIXED.** Reproduced from a screenshot with
  the tester's exact settings: prof Blacksmithing (not Enchanting), keep-current, Icon of the Silver
  Crescent locked, AND the UI's slider defaults (raid ratio {ehp:1,threat:4} + Min-HP 11500). My earlier
  repros missed it because they used GOAL_PRESETS (raid threat:2, no floor). With threat:4 the greedy+
  repair heuristic kept the higher-threat Eternal Rest libram and landed 102.26% < 102.4% (crushable,
  legal=false) — even though forcing the block libram (Repentance) gives 104.42% legal. Root cause: the
  Min-HP floor-recovery in optimizeSets (`solveGoal`) only triggered on floor-unmet, not crush-unmet. Fix:
  trigger the recovery when EITHER the Min-HP floor OR the uncrushable gate is unmet (and required); the
  recovery already keeps only `c.legal` (= uncrit+uncrush+floor) candidates and picks the goal-scored best,
  so a threat goal maximizes threat AMONG legal sets. Verified: raid now Repentance/104.42%/legal; AOE
  unchanged (95.62%, crush-allowed, Eternal Rest). Regression test added. 136 tests pass.

- **Surplus-avoidance hint.** Player asked whether a 104.42% uncrushable kept set could trade surplus for
  threat. Found: with keep-current the gems are frozen so it can't (104.42%/647 is provably the max — grid
  searched); with re-gem the optimizer already trims to 102.83% and converts surplus → 698 SP (+51). So no
  engine change needed; added a `tipnote` in `setCard` that fires when crush gate required + uncrushable +
  any locked piece + surplus ≥ 1.5%, nudging the player to re-gem to convert the locked surplus to threat.
  Verified it shows for keep-current (surplus 2.02%) and hides for re-gem (0.43%).

- **#5 shareable links — DONE.** "Copy share link" on results encodes captureState() (gear + all settings
  + goal sliders + pins/locks/excludes) → gzip (CompressionStream) → base64url → location.hash, restored on
  load via restoreFromHash()→applyState(). Client-side only. slimExport() drops non-gear lines
  (NON_EQUIP_IGNORE/BAG/QUIVER/AMMO/TABARD/BODY) before encoding — verified byte-identical optimization,
  ~28% smaller link (BulkAggro 8337→6056 chars; normal collections ~2-3K). Compression round-trip verified
  in Node. Merged feature branch to main earlier (FF, 497aae0).

Roadmap now (added by owner 2026-06-30):
- Indicate which item is currently EQUIPPED vs swapped-in from bag/bank (per-slot badge).
- Investigate: can "Export to Sixty Upgrades" actually CREATE the set on SU via API (vs the manual import
  string)? Owner wants it if feasible. (Likely no public write API — confirm.)
- Declutter the paper doll when a slot has many "≈ also viable" alternates — move them to a right-side list/frame.
- (still) #6 credibility/math surfacing, #7 searchable name (held).
OPEN QUESTION being investigated: sim vs in-game WeakAura disagree on EHP (WA shows EHP/HP 31109/12057
Kings-only; likely the WA omits the Improved Righteous Fury damage-reduction factor the sim includes, and/or
compares a different set/buff). Reconcile against the user's live SavedVariables.

136 tests pass. Dev server: `npm run serve` (port 8000).

---

## 2026-06-29 — Seed live slider drags for smooth, monotonic SP (merged to main)

Live slider re-optimizes (the debounced `optimizeNow(live)` on Balanced-slider drags) were re-running
the greedy/repair heuristic COLD on every nudge, producing small non-monotonic wiggles — an SP dip
while sliding toward threat when it should only rise. Fix: on live drags only, `optimizeNow` builds
`options.seeds` (per goal: slot → itemId from `lastResults`) and threads it through `optimizeSets` →
`runGoal` → `optimizeHeuristic`, so each nudge climbs from the adjacent (already-good) set instead of
restarting. Reuses the `seed` plumbing that already existed for the floor-recovery EHP-lean sweep — no
engine surface change beyond `optimizeSets` reading `options.seeds`. Fresh (non-live) Optimize runs pass
`undefined` and still seed from scratch. Verified live with the player (slider now climbs SP smoothly,
no dips). 135 tests pass.

Touched: `src/runner.js` (optimizeSets reads per-goal seed), `web/app.js` (build seeds on live drags).

---

## 2026-06-29 — Balanced = blend dial between Survival & Raid (merged to main)

Built on branch `experiment/balanced-midpoint`, iterated with the player live (local `npm run serve`),
then merged to main (fast-forward). The Balanced set's slider now slides between the Survival set
(t=0) and the Raid Threat set (t=1): `currentGoals` (web layer) interpolates their ratios + Min-HP
floors and takes the nearer side's Eye lock, so the ENDS reproduce both sets exactly (verified: t=0 =
survival SP502/EHP33.4k/Moroes', t=1 = raid SP793/EHP28.7k/Eye). Balanced has no Min-HP knob (derived,
read-only). Slider step 0.125 (48 increments); EHP/Threat end labels are nudge buttons; live
re-optimize on slider drag (debounced 150ms, `optimizeNow(live)` skips the button toggle), gated on a
prior Optimize. Engine stayed ratio-generic — an earlier runner-side maximin experiment was reverted,
so `src/runner.js` is unchanged vs pre-experiment except the optimizeSets comment. 135 tests pass.

Note: the player liked the slider feel after coarsening from 0.05→0.125 and adding live updates.

**Then:** research agent (general-purpose) reviewed the guide + model on "avoidance above 102.4% vs
stamina" → local note `research/avoidance-above-cap-vs-stamina.md` (gitignored, `research/` ignored,
not public). Verdict: survival is a FLOOR objective, stamina should lead beyond the cap. Applied the
tuning to `PARTS.ehp` AND the SU `survivalEHP` scale (dodge 1.1→0.85, parry 0.9→0.7, agility
1.15→0.95, defense 1.1→1.0; survivalEHP block 1.02→0.25; `survivalUncrushable` unchanged). Survival
1.5:1/14k went EHP 34.6k→37.0k, +~75 stamina, still uncrushable. 135 tests pass.

---

## 2026-06-28 (night) — Optimizer scores tier set bonuses

Was blind to set bonuses (setBonuses computed for display only; no objective used it) — so a leg/
shoulder swap that completed/broke a 2pc/4pc was invisible to selection. Now each bonus is modeled as
an equivalent flat-stat bundle (`sets.js` `SET_BONUS_STATS`/`setBonusStats`) and added to the `scale`
objective via `score(setBonusStats(items), w)` in optimizer.js — scored by the goal weights, so threat
sets reward the (threat) bonuses and survival mostly shrugs. Values are spell-power-equivalents from
threat.js at ~800 SP: J2pc 20 (+10% seal ≈ +19 TPS), J4pc 15 (+15/HS block ≈ +13 TPS), CF2pc 12
(+15 Ret Aura/hit), CF4pc = blockValue 100. TUNABLE. Only wins vs the alternative item's stat delta —
never keeps a clearly-worse piece. 135 tests pass. (Context: player's survival run picked T5 legs and
"lost" a T4 2pc; the sim couldn't see the bonus. Note: the T4 2pc is +10% SEAL = a THREAT bonus, so on
a pure survival set the leg choice should ride on stats — Justicar legs are the better SURVIVAL piece
anyway: +32 stam, +31 parry, +12 agi vs T5's socket/defense/block.)

Caveat not addressed: nearAlternatives deltas are still per-item stat-only (not set-bonus-aware), so an
alternative that changes set count shows a slightly-off %. Minor display only.

---

## 2026-06-28 (night) — Survival: full avoidance > block beyond the cap

Player asked the survival logic to value miss/dodge/parry over block once past the crush cap (a
dodge negates a whole ~5k hit; a block only shaves ~275). Lever = sim-internal `PARTS.ehp` (NOT an SU
scale — SU export uses `SCALES`). First tried block 0.3→0.15; that broke `librams.test` (survival
flipped from Libram of Repentance (block) to Libram of the Eternal Rest (pure Consecration threat) —
devaluing block so far that a survival set abandons a defensive piece for threat is wrong). Settled on
RAISING full avoidance + a modest block cut: `dodge 1.0→1.1, parry 0.8→0.9, agility 1.05→1.15,
block 0.3→0.25` (gap ~4.4×, floored so block still beats pure threat for survival). Reaching the cap
still priced by CAP_SCALE (block 2.5×). 133 tests pass. Survival set dodge 24.1→25.1%.

---

## 2026-06-28 (late eve) — Meta final pass, faction auto-detect, unpin-all

- **Bug (player-found):** with keep-equipped + agility scroll, the 1:4 set swapped Battlescar Boots
  (blue socket) → Boots of the Righteous Path (no blue) for threat, dropping total blue 3→2 and
  deactivating the kept head's Powerful Earthstorm Diamond (3+ blue) — silently losing +18 stam.
  Selection isn't meta-color-aware, and a KEPT meta's sockets can't be recolored (resolveMetas only
  recolors non-locked focus sockets). **Fix:** (1) `gemSet` now subtracts an inactive kept meta's stats
  (locked resolved stats include the socketed meta gem), so a meta-killing swap reads as a loss; (2) a
  final meta-repair pass — when any meta is inactive, search non-locked slots for an owned item that
  restores the color, take the best legal swap that turns every meta back on. `gemSet(scaleOf, sel)`
  refactored to gem a trial selection. Verified: the repro now keeps Battlescar + meta ON.
- **Faction auto-detect** (`enchants.js` `detectFaction`/`factionFromEnchant`): shoulder inscriptions
  are rep-locked, so read faction off the equipped shoulder enchant id (2978→Aldor, 2995→Scryer, …).
  Dropdown removed; UI shows a readout (falls back to "considering both"). Player's = Scryer.
- **Unpin all** button per set (clears that goal's pins).

Tests: meta-faction.test.js (3) → 133 pass. Files: runner.js, enchants.js, app.js, index.html,
style.css.

---

## 2026-06-28 (eve) — Three player-requested levers: pins, scrolls, RF-into-EHP

Shipped all three (130 tests pass):
- **Pin item to slot + re-optimize.** Per-goal `pinnedSlots[goalId][slotKey]` from the UI; pin button
  on the picked item and every "≈ also viable" alternate. `runGoal` restricts that slot's pool to the
  pinned item's variants (keeps focus/cap so gemming stays flexible) and optimizes the rest around it.
  UI: gold slot edge + "📌 pinned · unpin", alternatives hidden while pinned.
- **Consumable scrolls** (`src/scrolls.js`): Agility/Strength/Intellect V (+20, ride the buff block so
  Kings ×1.1 applies) and Protection V (+301 armor via a new `flatArmor` channel that bypasses the
  Toughness item-armor mult). Checkboxes in the config panel; `optimizeSets({ scrolls: [...] })`.
- **Imp RF −6% → EHP.** `talentsFromRanks` emits `impRighteousFuryDR` (rank×0.02); `aggregate` exposes
  `damageTakenMult`; `evaluateSet` divides physical EHP by it. Flat factor → rankings unchanged, EHP
  number ~6% higher at 3/3. No test asserted absolute EHP, so safe.

Also confirmed (answers to the player's questions): "Lock this set's gems/enchants" is **additive** —
it adds the displayed set's item-ids to `lockedItemIds`, OR-combined with the keep-scope dropdown
(doesn't replace; locks gems/enchants only, NOT slot selection — which is exactly what the new pin
feature adds).

Model files touched: model.js (TALENTS/talentsFromRanks/aggregate), character.js (EHP), runner.js
(ctx buff merge + pins), scrolls.js (new), app.js + index.html + style.css (UI). Tests:
test/scrolls-pins-rf.test.js.

---

## 2026-06-28 (late pm) — "poor results" turned out to be a wrong-gear scan + one real label bug

After the addon v0.7.1 fix, player re-scanned and still saw a weak Raid set (721 SP, 5.69% hit,
**not uncrittable 5.54%**) — exactly reproducible. Long reconciliation revealed the fresh export
(19:53) was taken **in the player's PvP set with PvP/Ret talents** (Anticipation=0, Deflection=3,
def skill 443 → 4.83% crit reduction → genuinely crittable), NOT the tank threat set. So the sim was
right; the scan was wrong. **No sim/talent bug.** Player just needs to re-scan in the tank set + tank
spec. (Lesson: when reconciling, check the export's `T:`/`TR:` talents AND that equipped gear matches
the expected set before assuming an engine bug. The `defenseSkill`/`critReduction` mismatch vs the ECS
sheet was the tell.)

**One real bug fixed along the way:** the set header's "all gates met" used `res.legal` (the heuristic's
APPROXIMATE selection-stat gate check), so it could claim legal while the FINAL gemmed set missed a
gate — contradicting the red per-gate badge the player saw ("Uncrittable 5.54%" next to "all gates
met"). `runGoal` now returns `legal: finalLegal(evald)`. 125 tests pass.

**Reverted (not shipped):** a speculative keep-mode "seed the search from the worn set" change to
optimizeHeuristic — it didn't address the real issue (the worn set was genuinely illegal under the
PvP spec) and was unvalidated, so it was backed out to keep the diff to the honest-label fix only.

---

## 2026-06-28 (pm) — Shield Block enchant parser bug (sim couldn't match the hand-built threat set)

**Report:** player's hand-made 1:4 threat set (806 SP, uncrushable w/ Kings+MotW) beat the sim's set
on every threat metric; player runs the threat set with **"keep equipped completed"** intentionally
(committed to its gems/enchants, optimizing the OTHER sets around it). Target settings: 1:4, 11.5k
min HP, Scryer, no imbued meta, Kings+MotW.

**Root cause (found by reconciling the sim against the player's ECS character sheet):** dodge / parry /
defense / resilience all matched the sheet to <0.05% — the gap was **block**. The "Enchant Shield –
Shield Block" enchant (id 2655, +15 block rating) renders as **"+15 Shield Block Rating"**; the
addon's `%+(%d+) block rating` phrase requires "+N block rating" with nothing between, so the "shield"
qualifier made it miss — the +15 block rating was dropped from the export. (Confirmed via wowhead
spell=27946; a +18-stamina shield enchant parsed fine, isolating it to the block-rating wording.)
Effect: a truly uncrushable set read as crushable (100.91% vs 102.82% w/ the +15), so in keep-mode the
optimizer refused to keep the Merciless shield and over-defended with Aldori → 783 SP vs the player's
806.

**Fix shipped:** `addon/TankadinGearSim/TankadinGearSim.lua` `parseClause` now catches any clause
naming "block rating" (never "block value"), qualifier-agnostic. `.toc` → 0.7.1; export VERSION stays
11 (content fix, not a wire change). **Verified end-to-end** by injecting the +15 into the player's
fresh export (exported 17:21) and re-running the exact settings: SP 806 / 9.18% hit / 11,897 hp /
102.82% uncrush / 5.63% crit, selecting Merciless + Brooch + Wristguards + Sergeant's Cape — i.e. the
player's hand-built set, exactly.

**Player action required:** re-copy `addon/TankadinGearSim/` into the live AddOns folder
(`C:\Program Files (x86)\World of Warcraft\_anniversary_\Interface\AddOns\TankadinGearSim\`),
`/reload`, `/tgs`, re-import. (Offered to copy it for them.) The current/old exports still lack the
block rating until then.

**Note:** the export-time SavedVariables lives at
`...\_anniversary_\WTF\Account\51718250#1\SavedVariables\TankadinGearSim.lua` — readable straight off
disk for reconciliation (decode the `["export"]` Lua string).

---

## 2026-06-28 — Diagnosed two "missing" reports + shipped per-slot alternatives

**Context:** player pulled a fresh export (now owns Brooch of Unquenchable Fury) and reported (1)
gem sockets only showing on Veteran's Lamellar Bracers + Aldori Legacy Defender, (2) the Brooch
not appearing in a 1:4 / 10k-min raid set.

### Diagnosis (no bug in current code)
- Pulled the live SavedVariables straight off disk:
  `C:\Program Files (x86)\World of Warcraft\_anniversary_\WTF\Account\51718250#1\SavedVariables\TankadinGearSim.lua`
  (TGS11, 200 items). Extracted to `scratchpad/export-new.txt`.
- **Sockets:** the current code parses all **19 socketed items** correctly via the web load path
  (`toExportText`→`parseExport`). The two items that "showed" are exactly the ones with
  **currently-empty** sockets (their `EMPTY_SOCKET_*` lives in BOTH the resolved and base fields);
  gem-filled items carry the layout only in the **base** field. So the player's browser was running
  **stale JS** that reads sockets from the resolved field only (pre-v8 behavior). `origin/main` ==
  local, so the deploy is current → it's a browser cache. Fix = hard refresh / re-upload.
- **Brooch:** not a bug. At 1:4 buffed, the optimizer picks **Pendant of Dominance** (ties the Brooch
  on spell power — 812 vs 812 — but adds a gem socket, +16 resilience, more stamina; the Brooch's only
  edge is raw spell hit, which the sim makes up elsewhere). The Brooch is ~tied, slightly behind on EHP.

### Shipped — per-slot near-identical alternatives (committed? see git)
- `runner.js` `nearAlternatives(slotKey, chosen)`: for each slot, lists owned items whose objective
  contribution is within **1% of the WHOLE-SET objective** (`ALT_EPS`, `ALT_MAX=3`), each with its own
  `planItemGems` gems/sockets and `objDelta`. Objective is linear in summed stats, so slot delta == set
  delta; normalized by `res.objectiveValue`. A swap that would miss a gate as a pure drop-in is kept but
  flagged `dropInLegal:false` (not hidden) — that's how the **Brooch surfaces as a neck alt (+0.43%,
  "needs re-gem")**. Exposed as `perSlot[slot].alternatives`.
- `optimizer.js` exports `distinctOk`. `app.js` `altsHTML` renders the block; `style.css` `.ds-alts*`.
- Tests: `test/alternatives.test.js` (3) → **125 pass**.

**Pick up here:** confirm in the live browser after a hard refresh that (a) gem-filled items now show
their sockets and (b) the new "≈ also viable" lists render. Consider whether "needs re-gem" is too
frequent (the set sits near the gate boundary, so most avoidance-changing swaps trip it).

---

## 2026-06-27 — SESSION WRAP / pick up here

Big day on the gear sim (entries **a–j** below have the detail). All work committed + pushed to
`main` (tip `26f5422`), tree clean, **122 tests pass**. Highlights:
- **Gemming/sockets:** gate-aware socket bonuses; never drop a free bonus; per-gem socket-color chips;
  active-vs-skipped bonus shown; meta now counts locked items' colors + flags a kept dark meta.
- **Keep-mode:** "keep existing gems/enchants" with scope presets (off / all completed / equipped
  completed / current as-is) **plus** a per-set "Lock this set's gems/enchants" button (banner + Clear).
- **AOE Trash:** uses aoeThreat weighting; **crush gate dropped** (trash ≤72 can't crush); spell hit
  de-valued (~5% cap). Librams modeled (Eternal Rest → ~35 spell damage; Repentance → block 42).
- **Import robustness:** keep stat-less equip items; lift resolved→base when the tooltip scan dropped
  an innate stat (the +spell-damage plate bug).
- **Sixty Upgrades:** weights panel exports the **SU JSON** (verified, incl. `spellCritRating` /
  `blockValueBonus`); gear export note reworded; buff note is a live per-set downstream calc.

**Open follow-ups (none blocking):**
- Kept inactive meta is *warned*, not auto-activated (deliberate; revisit if wanted).
- `INT_PER_SPELLCRIT=80` is a rough constant (no int→spell-crit formula in the model yet).
- Libram spell-damage value (~35) and AOE weight magnitudes are tunable approximations.
- Runner gate-recovery (gate-aware re-gem) is unit-tested but not yet exercised by a real crushable scan.
- Pre-existing: onboarding README / user on-ramp (commit 3685d21); bundled unowned-item DB (open M3).

---

## 2026-06-27 (j) — Locked-meta fix, per-set lock button, live buff note

Batch of four from the player:
1. **AOE meta inactive (only 2 blue).** Root cause: when items are LOCKED, `resolveMetas` didn't count
   their current gem colors, and a meta socket on a locked item wasn't evaluated at all. Fixed: tally
   locked items' gem colors toward activation, and flag a kept (locked) meta active/inactive vs the
   whole-set colors (`m.kept` flag) so a dark meta surfaces in metaWarn. (Non-locked AOE meta was
   already active in tests; the bug only bit with locking.)
2. **Per-set "Lock this set's gems/enchants" button.** `web/app.js` `lockedItemIds` Set + `buildKeepSpec`
   (scope dropdown OR per-set locks); banner of chips with unlock × + Clear all; re-optimizes on change.
   `keepConfig` filters changed from AND to **OR** so item-ids stack with the equipped/all/current scope.
3. **Live buff note.** `buffNote(b, agg)` now prints each buffed stat with its downstream effect
   computed per-set: stamina(≈hp), agility(≈% dodge via crushAvoid), intellect(≈% spell crit via
   `INT_PER_SPELLCRIT=80` approx — model has no int→crit), armor(≈% DR via `ARMOR_CONST`). Dropped strength.
4. **Socket-color chips** were already shipped (cc8e273, `gemCell(g,true)` always) — confirmed intact;
   stale comment fixed. The player's screenshot predated it → hard-refresh.

Tests +2 (`keep-gems.test.js`: OR-combine; kept-meta flag). Suite **122 pass**.

**Possible follow-up:** a kept color-gated meta that's inactive isn't auto-activated by recoloring
non-locked recommended gems (we only warn) — deliberate, since forcing blue onto a threat set to light a
stamina meta is usually wrong; revisit if the player wants auto-activation. `INT_PER_SPELLCRIT` is a
rough constant; tighten if a real int→spell-crit formula is added to the model.

---

## 2026-06-27 (i) — Weights export: Sixty Upgrades JSON, not Pawn

Player confirmed SU's custom stat-weights format is a flat JSON of `{ ourKey: weight }` using the SAME
keys this sim uses (incl. `metaSockets/redSockets/yellowSockets/blueSockets`), zeros omitted — they
pasted a working single-target scale. The earlier "Copy Pawn string" was my wrong guess.

- `web/app.js`: replaced `pawnString` with `suWeightsJson(key)` = `JSON.stringify` of the scale's
  non-zero entries; button relabeled **Copy weights (JSON)**; on-page table now lists all non-zero
  entries (incl. socket weights AND blockValueBonus — the player's working survival scale confirmed SU
  accepts that key, so nothing is excluded). How-to in `index.html` updated (copy JSON → SU Custom Stat
  Weights); CSS class `.copy-pawn` → `.copy-weights`. Suite **120 pass**.
- The emitted single-target JSON matches the player's working one except it now also includes
  `spellCritRating: 0.45` (added when spell crit became scored). **Player verified SU accepts every key
  including `spellCritRating`** (pasted the updated Single-Target/AOE JSON, no error, key is listed) —
  so no key filtering is needed; the full non-zero scale imports cleanly.
- Scale drift to re-copy: Survival unchanged; **Single-Target** gains `spellCritRating 0.45`; **AOE**
  has `spellHitRating` 2.2→0.5 (level-72 trash) + `spellCritRating 0.7`.

---

## 2026-06-27 (h) — AOE tuned for trash: no crush gate, low spell hit

Player: the AOE set still held defensive pieces (Aldori shield, Crimson belt, Seventh Ring) because
of the crush gate; for level ≤72 trash there are no crushing blows and only ~5% spell hit is needed.

- **Dropped the uncrushable gate for the AOE Trash goal** (`gates.requireUncrushable: false`; trash
  ≤72 can't crush — only 73+ bosses). Crit immunity kept (trash can crit; set stays uncrittable
  anyway). This is what was holding shield-block/avoidance pieces; removing it flips the 1:4 AOE set
  to pure threat (Merciless Barrier, Veteran's Lamellar Belt, Seer's Signet + Seal of the Exorcist),
  ~+40 SP, avoidance ~89% (fine — not required).
- **Lowered spell-hit weight in the AOE scale** (sim + SU/Pawn): `PARTS.aoeThreat.spellHitRating`
  1.3 → 0.3 and `SCALES.threatAOE.spellHitRating` 2.2 → 0.5 (only ~5% needed vs a level-72 mob).
- Gate readout shows "Uncrushable N% — not required (trash)" for the AOE set (web `.gate.na` + CLI).
- Suite **120 pass**. NOTE: the AOE *preset default* is 1:2 (more EHP-weighted) so it still mixes in
  some survival/socketed pieces; full-threat behavior is at the 1:4 the player uses.

---

## 2026-06-27 (g) — Tooltip-scan capture gap; AOE picks explained

**Trigger:** player questioned AOE picks (Aldori>Merciless, Phoenix-Wing>Sergeant's, Battlescar>Boots
of the Righteous Path, Seventh Ring>Seer's Signet) and showed Girdle of Valorous Deeds' tooltip with a
"+20 spell damage" equip line — suspecting items are mis-read.

**Findings:**
- **Real capture gap.** The addon's tooltip scan (resolved field) dropped "+spell damage" equip lines
  ("Increases damage and healing done by magical spells and effects by up to N") on ≥4 items in the scan
  (Valorous Deeds sp19, Crusader's Ornamented Spaulders sp7, Seal of Danzalar sp24→12, Veteran's
  Lamellar Bracers sp21). `GetItemStats` (base field) captured them. **Fixed:** `import.js` lifts any
  resolved stat below base up to base (resolved ≥ base always holds for innate stats). Fixes keep-mode
  deltas (were going negative) + as-worn eval. Optimizer was already scoring off base, so picks unchanged.
  Regression test added. Suite **120 pass**.
- **Picks were already correct / are gate-driven.** With the current code the AOE 1:4 set picks the
  THREAT items — Merciless Gladiator's Barrier, Sergeant's Heavy Cape, Boots of the Righteous Path —
  NOT the defensive ones the player saw (so they were on an older build; both old single-target-threat
  and new aoeThreat weightings now pick the threat items). The **ring** (Seventh Ring of the Tirisfalen
  over Seer's Signet) is the crush gate: the AOE set sits at 97.78% vs the 97.4% relaxed cap, and
  Seventh Ring's block 24 + defense 17 is needed to stay uncrushable; Seer's Signet (caster, sp33+crit)
  would drop it below. Min HP "11k" wasn't binding (set already ~11.3k).

---

## 2026-06-27 (f) — Libram effect modeling (Consecration libram wins AOE)

**Context:** player asked why AOE picked Libram of Repentance over Libram of the Eternal Rest, and
gave the mechanic: in AOE, Holy Shield charges are consumed early so Repentance's "+42 block while
Holy Shield active" bonus drops, whereas Eternal Rest's +47 Consecration damage keeps benefiting
(Consecration hits every target). Tooltips confirmed: Eternal Rest = +47 Consecration dmg;
Repentance = +42 block rating while Holy Shield active.

**Shipped:**
- `src/librams.js` — models known librams as EFFECTIVE stats (overrides parsed stats, no double-count),
  matched by id or name. Eternal Rest → `consecrationDamage:47`; Repentance → `blockRating:42`.
  `import.js` applies it.
- New modeled stat **`consecrationDamage`** in `STAT_KEYS` + weights — NOT spell power (keeps the
  spell-power reconcile intact). ~0.4/SP-pt single-target, ~2× SP for AOE (per-target). Added to
  `PARTS.threat`/`aoeThreat`, the named threat `SCALES`, and `balanced`.
- **AOE Trash goal now blends `aoeThreat`** (was the single-target `threat` part — previously the AOE
  set differed from raid only by the looser crush gate, so Consecration's AOE value was invisible).
  `runner.js` preset ratio `{ehp:1, aoeThreat:2}`; `web/app.js` slider axis `aoeThreat` ("AOE Threat").
- Verified: AOE → Eternal Rest; raid/survival/balanced → Repentance. Tests `test/librams.test.js`
  (id/name match; AOE>ST Consecration value; per-goal relic split). Suite **119 pass**.

**Note:** weight magnitudes are reasoned approximations, not a derived threat sim.

**Revised same session (player feedback):** the `consecrationDamage` pseudo-stat was dropped — it can't
be expressed in the Sixty Upgrades scales, so weighting it there is invalid. Reworked to convert the
libram's flat damage to **equivalent spell damage** (a real/SU stat): Eternal Rest = ~35 spell damage
(raw coeff inversion ~49, discounted since it only feeds Consecration). Reverted consecrationDamage from
`STAT_KEYS` + all scales/PARTS. Kept the AOE goal on `aoeThreat` (real improvement; weights spell damage
higher). Net on the real scan: AOE → Eternal Rest; raid/survival/balanced → Repentance. Tests updated.
Caveat: a single spell-damage number can't make it AOE-*only* (that needed the per-scenario pseudo-stat);
tune the value in `librams.js`. Also reworded the socket note for the SU flow (gems are exported; you may
need to swap them between sockets in SU if the order wasn't right). Suite **119 pass**.

**Belt question (no code change):** AOE 1:4 picks Crimson Girdle of the Indomitable (gemmed for threat),
not Girdle of Valorous Deeds — the latter is a pure survival belt (int/stam/def/block, zero threat
itemization), so it scores far below the threat belts on the AOE scale and isn't needed to hold the
relaxed crush gate. Working as designed.

---

## 2026-06-27 (e) — Scan completeness: stat-less gear no longer dropped

**Trigger:** player asked why the AOE set uses Libram of Repentance not Libram of (the) Eternal Rest,
then flagged "the scan isn't picking up all my gear."

**Findings:**
- The libram is NOT in the export at all (only one relic line, Repentance id 29388 = blockRating 42).
  The addon exports every item it can read a LINK for (no stat filter), and reads bank contents only
  while the bank window is OPEN — so the most likely cause is the libram was in a CLOSED bank during /tgs.
- **Latent import bug fixed:** `equippableItems` required ≥1 parsed stat, so it silently dropped any
  equip-slot item whose value is a non-stat effect (a threat/Consecration libram, a pure on-use
  trinket). Now it keeps anything with a recognized slot (scored on whatever stats it has). Non-gear
  (shirt/tabard/quest) has no equip slot, still excluded. Tests updated + added (116 pass).

**Still open (told the player):**
- A libram only becomes *available* in the pool — its threat effect isn't MODELED as a stat, so it
  scores ~0 and won't auto-beat Repentance's block for AOE until libram effects are modeled.
- No way to force a specific relic (only trinkets have locks). A relic-lock or libram-effect modeling
  is the next step if they want Eternal Rest actually chosen.
- Possible addon improvement: report item counts by source (equipped/bags/bank) + warn if the bank
  looks closed, so completeness is verifiable. Not done yet (would bump addon to v12).

---

## 2026-06-27 (d) — Sixty Upgrades weights panel + leg-armor lock check

- **SU stat-weights panel** (`index.html` #weights-panel, `web/app.js` renderWeights). Shows the
  guide's named scales (ST threat below/at cap, AOE, survival uncrushable/EHP, balanced) as tables
  with a **Copy Pawn string** per scale (`( Pawn: v1: "Tankadin <label>": Key=val, … )`) + a how-to
  (custom weights / Pawn import / manual entry; gates aren't enforced by weights — hit 490 def & 102.4%
  first). Always visible (reference data, no export needed).
- **Leg armor in lock conditions — verified already handled.** Player flagged "other enhancement types
  (e.g. runic spellthread)" for the keep/lock completeness check. Leg armor IS an item enchant
  (Spellthread 2748 / Nethercleft 3013) stored in the enchant slot, which `lockEligible` already checks
  via `bestEnchant('legs') && !enchantId` — confirmed end-to-end (leg locks showing Runic Spellthread;
  a leg without it reads incomplete). Added a regression test. Suite **115 pass**.
- **No waist-enhancement gap after all.** The audit showed the waist takes no enchant in our DB; I'd
  flagged the Eternal Belt Buckle as missing — but the player corrected: the belt buckle is a **WotLK**
  item, not in TBC. TBC belts have no slot enhancement, so the waist correctly has none. Conclusion:
  **all TBC enhancement types are already covered** in the lock conditions (gems + every slot enchant,
  incl. leg armor). No socket-enhancement pass needed for TBC. (`socketsFromStats` dropping
  `socketPrismatic` is therefore moot for TBC.)

---

## 2026-06-27 (c) — Per-gem socket color (bonus actually activates in-game)

**Trigger:** player testing "re-gem everything" saw a shoulder's socket bonus grey out in-game even
though the recommended gems (Veiled + Glowing Nightseye) *could* earn it.

**Diagnosis:** the solver was RIGHT — at 1:2 it picks Veiled→yellow, Glowing→blue and credits the +4
stam bonus. But `perSlot.gems` dropped the per-gem socket color, so when socketed in-game the gems
went into the wrong sockets (Justicar Shoulderguards' sockets are physically blue-then-yellow) and
the bonus greyed. Export socket order is **unreliable** (Lua `pairs()` — confirmed: base seg lists
BLUE,YELLOW; resolved lists YELLOW,BLUE), so placement must be **color-based**, not positional.

**Shipped:** `perSlot.gems[*].socket` now carries the socket color; the web paper-doll renders a
colored socket dot before each gem (`gemRow` + `.sock-*` CSS) so you place each gem in the matching
socket. Forfeited-bonus fills still tag the physical socket (a gem may sit off-color when the bonus
isn't worth it — that's intended). Tests: `test/gem-socket.test.js` (gems tagged only to real sockets
of the item; Justicar shoulder maps one gem per yellow/blue socket). Suite **112 pass**.

**Follow-up:** CLI still prints gems as an aggregate (no per-socket color) — fine for a dev tool; the
web UI is the player-facing readout.

**Update (same session):** per player request, replaced the bare color dot with a **per-socket cell**
— socket-color chip on top, the gem beneath it — and added a **manual-socketing note** on each set card.

**Update 2 (same session):** make the deliberately-skipped bonus explicit. `perSlot.bonusKept` is
computed from the FINAL gems (every colored gem fits its tagged socket → survives meta recolors).
Paper-doll shows **✓ Socket bonus active: +N Stat** (with color chips, placement matters) when earned,
**✕ Socket bonus skipped: +N Stat** (chips hidden — gem can go anywhere) when forfeited. Tests +2
(bonusKept ↔ all-gems-fit; shoulder skipped at 1:4). Suite **114 pass**.

---

## 2026-06-27 (b) — "Keep existing gems/enchants" build mode

Implemented the backlog item from earlier today: a build mode that uses items **as they sit** —
no re-gem/-enchant — for budget players and for items **shared across sets** that can't be re-gemmed
on every swap.

### Shipped (this commit)
- **Engine** (`runner.js`): `optimizeSets` option `keepGemsEnchants` — `true` (lock all),
  an item-id array, or `{ itemIds, slots }`. Locked items become a **single variant** scored on
  resolved stats (no focus/cap split); final gemming skips `planItemGems`/`bestEnchant` and instead
  contributes the `resolved − base` delta (kept gems + enchant + active socket bonus) on top of
  `baseStats` — no double-count. Current gems/enchant are reported by mapping the export's gem
  item-ids + enchant effect-id back to names via the curated DBs (`GEM_BY_ID`, `ENCHANT_BY_EFFECT`);
  unknown ids fall back to a generic label. Per-slot readout gains a `locked` flag.
- **CLI** (`bin/optimize.mjs`): `KEEP_GEMS=1` env toggle; selection lines show `[kept]`.
- **Web** (`index.html` / `app.js`): "Keep current gems & enchants" checkbox → `keepGemsEnchants`;
  paper-doll shows a **kept** tag; the Sixty-Upgrades export uses the kept gem/enchant ids.
- **Tests**: `test/keep-gems.test.js` (3) — keep-all locks socketed pieces to their current gems
  (no threat re-gem; control asserts the unlocked run DOES re-gem); no double-count (set SP == sum of
  picked items' resolved SP); per-item lock keeps only the named item, others still optimize. Suite **106 pass**.

### Refinement (player feedback, same session)
- **Only COMPLETE items lock** (`lockEligible`). An item with an empty socket (gem count < socket
  count) or a missing enchant the solver would apply (perks/phase/faction-aware) is treated as
  UNLOCKED, so the solver finishes it. Effect: "keep all" = preserve finished gems/enchants, optimize
  the unfinished — the useful budget default with no per-item list needed. Tests: +2 (eligibility
  truth table; keep-all skips an item with a blanked gem). Suite **108 pass**.
- **Scope presets (player chose dropdown over a 40-item list).** `keepGemsEnchants` extended to
  `{ equippedOnly?, ignoreCompleteness? }`; web dropdown + `KEEP_GEMS=all|equipped|current`:
  Re-gem everything / Keep all completed / Keep equipped completed / Keep current set as-is
  (the last sets `ignoreCompleteness` so worn-but-unfinished items still freeze). Tests +3 (110 total).
  **Caveat / follow-up:** "as-is" freezes the worn gems/enchants but does NOT pin item *selection* —
  the optimizer can still swap a slot to a strictly better item (then gemmed). A true no-swap
  "evaluate exactly what I'm wearing" mode (force-select equipped per slot) is the next increment if wanted.

### Limitations / follow-ups
- Meta activation tally doesn't count a **locked** item's current gem colors toward a *non*-locked
  item's meta requirement (locked plans contribute no colored choices). Fine for all-locked (no meta
  is re-picked) and harmless for partial locks (recolor only touches focus sockets), but a locked
  blue-heavy chest won't help a head's "3+ blue" meta activate. Note for later if it bites.
- Lock = "as it sits now": a locked item with **empty** sockets stays empty (we keep current, we
  don't cheap-gem). Intended, but worth a UI hint so budget users aren't surprised.

---

## 2026-06-27 — Gate-aware socket bonuses (fresh TGS scan pass)

**Trigger:** on a fresh scan (`scratchpad/export-current.txt`), the player noticed the **raid
threat 1:4** set forfeited the **shoulder** (+4 stam) and **chest** (+4 defense) socket bonuses,
and tied the lost chest *defense* to the set being crushable even with Kings + MotW.

### Diagnosis (reproduced)
Both forfeits are the **blue** socket: the best threat gem is **Veiled Noble Topaz** (orange =
red+yellow), which doesn't fit blue. `planItemGems`' worth-it test (option A all-best-gem vs B
match-for-bonus) scored only on the goal weights; at 1:4 the blue-socket downgrade orange→purple
(Glowing Nightseye) costs ~11.6 obj pts while +4 def is worth only ~4.4 — so it forfeits. Correct
for *threat*, but the chest's +4 **defense** is avoidance that feeds the **uncrushable gate**, which
the threat scale prices at ~0. On this scan the set still clears the cap (≈102.95% / 102.4%), so it
sat right on the cliff; on the player's tighter config that forfeit tips it crushable. (Shoulder +4
*stam* is not a gate stat — that forfeit is genuinely threat-optimal.)

### Shipped (this commit)
- **Gate-aware worth-it test.** `planItemGems` gains a `gateScale` opt + exported `GATE_STATS`
  (defense/dodge/parry/block/resil/agility). When a piece's socket bonus is a gate stat and
  `gateScale` is given, the A/B decision is priced on the **cap scale**, so the cheap avoidance
  bonus (and the gems that earn it) win.
- **Runner gate recovery.** `runner.js` re-gems gate-aware whenever the socket-bonus-aware set comes
  up **crushable**, keeps it if avoidance rose, and leaves the flag **on through the reclaim pass**
  so reclaim (which re-gems threat) can't silently undo it.
- **Free bonus on a tie.** Worth-it tie-break `>` → `>=`: if the gems you'd slot anyway already match
  the sockets, the bonus is free, so bank it instead of forfeiting (per the player's follow-up).
- Tests: +2 in `gemsolver.test.js` (gate-aware keeps a defense bonus a threat set forfeits; free
  bonus banked when the best gem already fits). Full suite **103 pass**.

### Caveat / pick up here
On THIS scan no ratio ships a crushable set (the optimizer's def-gem variant search already
over-satisfies the cap to ~102.95%), so the runner gate-recovery path is a **safety net** validated
by unit test, not yet by an end-to-end crushable scan. If the player still sees crushable, get that
exact config (professions / phase / trinket locks) to repro the integration path directly.

### Backlog (player request — do AFTER the current config pass)
- ✅ **SHIPPED** (see the 2026-06-27 (b) entry above).
- **"Keep existing gems/enchants" option.** A toggle to build sets WITHOUT re-gemming/re-enchanting —
  treat each item's currently-socketed gems + applied enchant as **fixed** (score off resolved
  `item.stats`, skip `planItemGems`/`bestEnchant` for locked items). Two motivations: (1) **budget**
  players who can't afford to re-cut gems / buy enchants per set, and (2) when the **same physical
  item is shared across multiple sets**, you can't realistically re-gem/re-enchant it each swap, so
  its gems must stay put. Probably wants per-item granularity (lock some, optimize others) and a
  global "lock all current" default. Note the existing groundwork: the addon already folds worn-gem
  stats into resolved `item.stats`, and the gem layer already builds from `baseStats` to avoid
  double-counting — so a locked item just uses resolved stats and is excluded from the gem/enchant
  solver.

---

## 2026-06-26 — Threat-set tuning: buff stacking, spell crit, Veiled/Ornate gems

**Goal:** close the gap where the player's hand-built single-target threat set beat the sim's
max-threat output. Diagnosed against the player's TGS11 export + their sixtyupgrades set JSON.

### Diagnosis
- Item *selection* is already 2-opt optimal (a pairwise-swap climb found no improvement), so the
  gap was **objective/weights + gemming**, not search depth.
- Root causes: (1) **Kings + MotW were modeled as mutually exclusive** — they STACK (flat +
  percentage); player confirmed. (2) **Spell crit was unscored** (`spellCritRating` wasn't even in
  `STAT_KEYS`). (3) **Gem DB missing** `Veiled Noble Topaz` (5 dmg/4 hit) and `Runed Ornate Ruby`
  (+12, unique) — the player's actual gems.

### Shipped (this commit)
- **Buff stacking** — `runner.js` `BUFF_MODE` now has a `raid` mode (Kings + MotW together); it's
  the default for `buffed`/CLI/UI. The model already layered them correctly; only the mode picker
  was wrong. `index.html` dropdown + note updated.
- **Spell crit scored** — `spellCritRating` added to `STAT_KEYS`, the `ZERO` weight template, the
  threat `PARTS` (0.3) / `aoeThreat` (0.4) and named threat `SCALES` (0.45–0.7) and `balanced`
  (0.3); calibrated from a crit's +0.5× damage. `aggregate` surfaces it; CLI prints it. Crit stats
  added to the Potent gems + the two inscriptions that carry it.
- **Gems** — added `Veiled Noble Topaz` (player-confirmed 5 dmg/4 hit) and `Runed Ornate Ruby`
  (+12 spell dmg, **`unique: true`**). `bestGem` skips `unique` gems for bulk fill (workhorse stays
  Runed Living Ruby) — Ornate's real value is only +3 SP in one socket.

**Result:** the sim's Raid Threat set now independently reproduces the player's Veiled-gemmed,
high-hit, crit-carrying build — 791 SP / 8.31% hit / 33 crit-rtg vs the player's 801 / 8.63% / 38,
trading a little SP/hit for more stamina (the EHP component). Tests **99/99**.

### Follow-on (same session)
- **Import name-parsing bug fixed.** The addon's optional `socketBonus` field is sometimes omitted
  (`…|base|name`) rather than empty (`…|base||name`); the fixed-index parse put the name in the
  bonus slot and dropped it — every trinket showed an ID in the lock dropdown. `import.js` now
  resolves trailing fields by shape. Verified: 0 items missing names on the live export.
- **Model reconciled** to the player's sheet + Sixty export: hit 8.63% / crit 38rtg match exactly,
  SP/str/agi/int exact, stamina within ±rounding. The engine is trustworthy end to end.

- **Meta activation fixed for threat.** The threat set's meta wasn't activating (only spell-dmg
  meta was Imbued, "more red than blue", fragile + behind a toggle). Added **Ember Skyfire Diamond**
  (+14 spell dmg, 3+ red) — robustly active on a red/orange threat set. Also corrected Eternal
  (`2+ blue, 1+ yellow`) and Relentless (`2+ red, 2+ yellow, 2+ blue`); `metaActivated` now parses
  comma-AND clauses. Verified: full-threat meta = Ember, active, with the Imbued toggle on OR off.
  - **NOTE / follow-up:** the player's client shows different meta item IDs than the DB (screens:
    Ember 46601, Eternal 46597, Powerful 32866, Relentless 39961) vs DB classic IDs (35503/35501/
    25896/32409). Math is unaffected (DB is a recommendation pool), but Wowhead links may point at
    the classic cut. Revisit if we start matching owned gems by ID.

### Shipped (later in session)
- **Reclaim the gate overshoot (the big one).** Root-caused the "def gem on a max-threat piece"
  complaint: the optimizer selects cap/def-gem variants from APPROXIMATE stats, but the final
  socket-bonus-aware set clears the gates without them and sits several % over the uncrush cap.
  `runGoal` now runs a reclaim pass on the true final stats — flips def-gemmed pieces back to threat
  gems greedily, keeping any flip that stays legal. Max-threat: uncrush 105.2% → 102.7%, +27 SP,
  neck back to Veiled; only a genuinely load-bearing def-gem remains. Factored final gemming into a
  reusable `gemSet(scaleOf)` + `finalLegal(evald)` helper.
- **Ember Skyfire is PHASE 5** (player), so it's gated out now; current-phase threat meta is Imbued
  ("more red than blue", active on an all-red/orange set). Compound meta requirements corrected
  (Eternal 2blue+1yellow, Relentless 2red+2yellow+2blue) so dead metas are never recommended.
- **Min-HP gate per set.** Hard raid-buffed-HP floor on every goal (incl. AOE), enforced like
  uncrit/uncrush. `optimizer.js` gates + `gateDeficit` (HP shortfall ÷1000 to match %-unit
  deficits), `character.js` surfaces `health`, web UI adds a 10k–14k/500 slider + gate chip.
  Verified: gate binds (raises HP, trades SP) or marks the set illegal when unreachable. Test added.
- **Neck gem confirmed** (Pendant of Dominance → Veiled, earns the +2 spell-crit socket bonus).

- **Epic gems are unique (realm rule).** Player confirmed every epic cut is one-per-character.
  `bestGem` excludes `epic` (and `unique`) gems from bulk → falls back to the near-identical rare
  cut (Tanzanite→Nightseye, Chrysoprase→Talasite, Fire Opal→Dawnstone). Impact <1% across sets.
  `allowUnique` opt-in left as the hook for single-placement.

- **Meta-recolor preserves socket bonuses.** Repro (with the Imbued meta toggle OFF, so the threat
  set falls back to the Powerful 3-blue meta): the recolor turned the helm's yellow socket blue with
  a purple gem (Glowing Nightseye), forfeiting the +4 dodge bonus — player spotted it and suggested
  a green gem (Enduring Talasite). Fix: `bestGem({alsoFits})` + the recolor prefers a dual-color gem
  fitting both the meta color and the socket's own color (yellow→green), keeping the bonus. Verified:
  helm now keeps Veiled / earns the +4 dodge. **Player confirmed this was the fix** — the wrong-color
  helm gem forfeiting the +4 dodge was what pushed them under the crush cap (Imbued was unchecked).
- **Enchants phase-gated** (they weren't). `bestEnchant` skips enchants above `opts.maxPhase`
  (default CURRENT_PHASE), threaded through runner + `recommendEnchants`/`solveLoadout`. **Cloak -
  Steelweave → phase 5** (player), so survival/def now fall back to Cloak - Dodge → then Greater
  Agility (next item).
- **Agility valued a touch above dodge rating** in the EHP-value scales (`PARTS.ehp` 1.05,
  `survivalEHP`/`balanced` 1.10 vs dodge 1.0/1.06): agility gives less dodge per point but also armor
  (2/agi) + melee crit and scales with Kings. Cloak enchant now picks **Greater Agility** over
  Cloak - Dodge. `survivalUncrushable` (def-gemming for the cap) left dodge-ahead on purpose — the
  crush cap is raw-avoidance-per-point, where dodge rating wins.

### Pick up here
1. **Onboarding: simple README + user-friendly on-ramp for testers/users (player request).** Cover
   BOTH halves end to end: (a) the **TGS addon** — install (drop `addon/TankadinGearSim` into
   `Interface/AddOns`), `/tgs` then `/reload`, where the export lands
   (`WTF/.../SavedVariables/TankadinGearSim.lua`) or the copy box; (b) the **gear sim** — open the
   live tool, paste the export (or load the file), pick a goal + move the EHP↔Threat / Min-HP
   sliders, set buff/phase/faction/Imbued toggles, read the gates (uncrit/uncrush/min-HP) + paper
   doll, export back to Sixty Upgrades. Keep it short, screenshots/gifs, "5-minute first run" tone.
   The current top `README.md` is dev/status-flavored — add a clear quick-start up top (or split a
   `docs/` page) aimed at non-devs.
2. **Faction:** player is **Scryer** (uses Greater Inscription of the Orb). CLI/`bin` defaults to
   Aldor → would pick Discipline. Make faction a first-class setting / detect it.
3. **Per-socket gemming** granularity (whole-item focus/cap variants still).
4. **Pure-threat slider** — now LOW impact (Veiled gemming maxes threat regardless; pure-threat SP
   785 < raid 791), so deprioritized vs the soft cap.
5. **Spell-hit soft cap — DEFERRED (player: "a while before I approach the hit cap").** Future work:
   the blended ratio goals value `spellHitRating` at a flat 1.1× with NO cap; past the **17%
   spell-hit cap** it should drop to ~0 (the named `threatSingleAtCap` scale does this; the
   PARTS/blend goals don't switch). Not urgent — player is far below the cap.
6. **Reconciliation TODO:** feed the player's exact set in and confirm the model reproduces
   801 SP / 8.63% hit / 8.98% crit / 11,957 HP end to end.
7. **Single-placement for unique gems — DECLINED (2026-06-26).** Player: "it's fine to leave the
   epics off, anyone with one can just add it to their Sixty Upgrades." Unique/epic gems stay
   excluded entirely; the `bestGem({allowUnique})` hook remains but don't build on it unless asked.

---

## 2026-06-25 — Export box fixed → full-bank run; import + optimizer hardening

**Goal:** get a real export off the live client, then run the full collection.

### Shipped (committed + pushed)
- **`d4d7cce` — Addon v0.5.0.** The `/tgs` copy box rendered blank on the `_anniversary_`
  client (EditBox in a ScrollFrame, focused before shown, no height). Added a **SavedVariables
  dump** (`TankadinGearSimDB`) as the primary path: `/tgs` then `/reload` flushes the full
  export to `WTF/Account/<acct>/SavedVariables/TankadinGearSim.lua`, read straight off disk.
  Also hardened the box (show before SetText/focus, explicit height). `.toc` bumped so the
  AddOns list confirms the loaded version. Export VERSION stays `9` (no wire change).
- **`cf35ab0` — import backfills shield armor.** `GetItemStats` (the `base` field) reports 0
  armor for shields (live: base 0 vs resolved 5727). `parseExport` now copies resolved armor
  into `baseStats` when base lacks it (exact, not a double-count — gems never add armor, TBC
  shields take no armor enchant). Without this, re-gemming from `baseStats` lost ~5.7k armor.
- **`0d30212` — optimizer: paired slots + four ratio goals.** Folded the scratch-harness logic
  in: `buildPool(items,{lock,exclude2H})` expands ring/trinket → ring1/ring2 + trinket1/trinket2
  (with distinct-groups), drops 2H, applies locks. Both solvers enforce distinctness; heuristic
  honors locks. Gates take `uncrushableTarget` (AOE trash may sit ~5% under). Objectives are
  pluggable (`spellPower`/`ehp`/`scale`/fn). `weights.js` `GOAL_SCALES`: raidThreat (threat:sta
  2:1), survival (ehp:threat 2:1), aoeThreat, balanced2 (1:1). Tests 91/91.

### Full-bank run (scratch harness `scratchpad/optimize.mjs`, NOT committed)
Decoded the live export → 212 items / **109 equippable**, all slots. Four goals, UNBUFFED + HS:
Survival EHP 33.9k, Balanced 30.9k/SP646, Raid SP745/uncrush, AOE SP831 @97.4%. All uncrittable.

### Then shipped (committed + pushed) — addressing that feedback
- **`62760b5` — buff model.** `aggregate` takes `opts.kings` (+10% primaries, after flat buffs)
  and `opts.buffs` (MotW flat +14); `BUFFS` exports both. Defaults off (reconcile untouched).
- **`35fb11f` — meta-gem activation.** `metaActivated()`/`gemColors()` (hybrids count for both
  colors); `bestMeta(w,{counts})` only returns an activatable meta; `solveLoadout` tallies the
  set's colors then picks the meta and flags any that can't activate.
- **`f426a1b` — committed runner `bin/optimize.mjs`** (`npm run optimize [export.txt]`). Buffed,
  locks Icon (all) + Eye (non-survival), four goals. **Gemming is a LEVER for the caps**: each
  socketed item enters as a focus variant (goal gems) and a cap variant (avoidance/defense gems),
  so the optimizer keeps a higher-threat item and def-gems IT when that beats a tankier swap
  (triggers on the survival/balanced helm). Final gems socket-bonus-aware via `solveLoadout`.

**Validated:** raid-threat hits **762 SP @ 7.04% spell hit, uncrit+uncrush** — matches the
player's hand-built target (760 SP / 6.73%). Buffed four-set summary:
Raid 762SP, Survival EHP 35.9k, AOE 840SP @97.5%, Balanced 680SP/EHP 33.3k.

### Pick up here
1. **Heuristic selection/final mismatch:** selection uses approximate raw-gem variant stats, the
   final regems via `solveLoadout`; the survival/balanced helm gets def-gemmed even though the
   set finishes ~104.7% uncrush (slight overshoot — could keep ~24 stamina). Tighten by gemming
   during selection or feeding the cap-lever the real socket-bonus-aware stats.
2. **`GOAL_SCALES` sub-weights are first-pass** — tune the ratios/spell-hit weighting now that
   buffed/locked numbers are in (player may want more spell hit vs raw SP).
3. **Tome of Fiery Redemption** swap into the lock list once acquired (replaces Eye of Mag).

---

## 2026-06-24 — Socket-bonus export gap → per-item gemming, cap-aware solver, item names

**Goal of the session:** close the addon socket-bonus export gap (the open M3 item), then
use it to run a real BiS optimization over the player's collection.

### Shipped (committed)
- **`7485458` — Addon v8 + per-item socket-bonus matching.**
  - Addon v8: each item line now `…|<resolved>|<base>|<socketBonus>`. `base` = `GetItemStats`
    on the gem/enchant-**stripped** base link → clean stats + **full socket-color layout**
    (every socket, even filled). `socketBonus` = discrete `ITEM_MOD_*:val`.
  - `import.js` exposes `item.baseStats`, `item.sockets`, `item.socketBonus`.
  - `gemsolver.js` `solveLoadout` now plans gems **per item**: compares (best raw gem, ignore
    color) vs (color-match to earn the bonus) by goal weights, keeps the winner. Gem stats
    added relative to `baseStats` (no double-count).
- **`0959e21` — Cap-aware gem solver.** `gemWeights(weights, { atCapWeights, uncrushable })`:
  once a set is already uncrushable, swap the `survivalUncrushable` premium scale for
  face-value `survivalEHP` so it stops stacking now-worthless avoidance. `solveLoadout`
  auto-detects uncrushable via `aggregate`/`evaluateSet` when `atCapWeights` is passed.
- **`0a4e19a` — Addon v9: item names.** Append the item's display name (`GetItemInfo`) as a
  trailing field; `import.js` exposes `item.name`. No name DB needed for owned gear.

Tests: **82/82** green throughout. Reconcile fixture (`lollerskate-unbuffed.js`) left untouched.

### Verified on the player's live exports
- v8 export confirmed the key unknown: `GetItemStats("item:<id>")` returns the **full socket
  layout even for gemmed items** (chest 29066: base stam 48 vs resolved 90, sockets still
  `{red,yellow,blue}`). Per-item worth-it works (neck forfeits a worthless +2 spell-crit
  bonus, keeps raw stamina; everything with a stam/def/dodge bonus color-matches).
- **Crit immunity:** model adds def + resilience additively (`critReduction(defenseSkill,
  resilienceRating)`), so the player is uncrittable at 468 def + 59 resil (6.25% ≥ 5.6%).

### Optimization run (ad-hoc, via a scratch harness — NOT committed)
Ran two goals over a **partial** bag pool (~37 of ~90 equippable bag items hand-transcribed).
Constraints honored: **Icon of the Silver Crescent (29370) locked** to a trinket slot; 2H
weapons excluded; paired ring/trinket slots + distinctness handled in the harness.
- **Survivability:** reaches **UNCRUSHABLE (108.4%)** — current worn set is only 100.2%. Max
  EHP ~32.2k. Cap-aware gems shifted survival gemming from 143 def / 107 sta → 81 def / 239 sta.
- **Single-target threat:** SP 810 (up from 777), uncrittable via 449 def + **102 resil**
  (leans on resilience to free budget for spell power).

### Pick up here tomorrow
1. **Re-export `TGS9`** (copy `addon/TankadinGearSim` into AddOns, `/reload`, `/tgs`) so the
   readout shows real **item names**. Paste it back → I'll re-run the two-goal optimization
   with names instead of IDs (and can drop the unreliable guessed-name map in the scratch
   harness).
2. **Full-bank run.** This session's run used only a partial pool because the bag items were
   hand-transcribed from the paste. To run the COMPLETE collection, save the export to a file
   (e.g. `scratchpad/export.txt`) so I parse all of it — the manual paste is the bottleneck.

### Known follow-ups / caveats (not yet done)
- **Gem double-count:** `solveLoadout` `addedStats` is relative to base; cap numbers already
  include current gems. A full re-gem readout must build from `baseStats`, not resolved stats.
- **Optimizer paired slots:** ring1/ring2 + trinket1/trinket2 and uniqueness are handled in
  the scratch harness, not in `src/optimizer.js` (still one-item-per-slot, no uniqueness, no
  weapon/offhand 2H exclusivity). Worth folding into the optimizer proper.
- **Item DB (open M3 item):** now only needed for **manual search of UNowned items** — names
  for owned gear are covered by addon v9. Scope shrank accordingly.
- **Minor addon glitch:** a few random-suffix bag items export a mangled token
  (`…RESISTANCE0_NAME=364ESISTANCE0_NAME=364`); parser drops it harmlessly. Cosmetic v9.x fix.

## 2026-07-02 — In-game addon, phase 1: live evaluator (addon v0.8.0)

Kicked off turning the browser sim into a real in-game addon (CurseForge later). Plan file:
`~/.claude/plans/snappy-forging-knuth.md`. Decisions locked with the user: **phased** (live
evaluator now, optimizer later); **generate data / hand-port logic** for engine sync; **Ace3**
as the eventual UI; addon **stays in this repo** under `addon/TankadinGearSim/`. MVP is
folder-copy testable **without CurseForge**.

### What landed
- **Ported engine (pure math, no WoW API):** `addon/TankadinGearSim/engine/Constants.lua`,
  `Combat.lua`, `Evaluate.lua` — a faithful port of `src/{constants,combat,character}.js`.
  Fixed the classic Lua `a and b or c` ternary trap in `passesGates` (raid-immune=false would
  fall through to the heroic check) with an explicit branch.
- **Live readout:** `Core.lua` reads the sheet finals (dodge/parry/block/defense/resilience/
  armor/health/spellpower/blockvalue), derives miss-vs-boss from defense skill (same formula as
  `model.js:124`), and feeds `evaluateSet`. Recomputes on equipment/stat events (coalesced one
  frame). `UI.lua` renders it in a native-frame window (Live + Export tabs) with a Holy Shield
  toggle. `TankadinGearSim.lua` is now a thin entry (namespace + slashes); the exporter moved
  intact to `Exporter.lua` behind `/tgs export`.
- **Parity harness (anti-drift):** `bin/gen-fixtures.mjs` → `test/lua/fixtures.lua` (JS goldens);
  `test/lua/eval_parity.lua` checks the Lua port within 1e-6. Verified **69/69 field checks / 5
  fixtures** under a Lua VM; all addon `.lua` files syntax-clean; JS suite still **149/149**.

### First in-game test + v0.8.1 fix (same day)
Ran the Live tab in-game against the user's **Tankadin II WeakAura** (screenshot:
`C:\Users\matth\Desktop\AI\BiS\wow-tbc\screencaps for testing\v01 tgs in-game.png`). Everything
reconciled — miss/dodge/parry/block, armor (16294), block value (250), health (11317) — **except
crit**: TGS showed 5.20% ("CRITTABLE") vs the WA's 5.88% (uncrittable). Root cause: on the
Anniversary client `GetCombatRating(CR_CRIT_TAKEN_MELEE)` returns **0**, so resilience (~27 rating
= 0.68%) was dropped. Fixed in **v0.8.1** (`Core.lua`): read resilience across the crit-taken CR_*
indices, else fall back to `GetCombatRatingBonus` (%) → rating. Added **`/tgs debug`** to dump raw
API reads. Widened the window / moved the value column right (text no longer overlaps). DR/EHP
delta (57.67%/26735 vs 61.90%/29706) is **expected** — TGS mitigates vs a level-73 raid boss, the
WA does not. Pushed: `d5693b2`.

### Pick up here next
1. **Re-verify the crit fix in-game** (user): re-copy `addon/TankadinGearSim`, `/reload`, `/tgs` →
   crit should now read ~5.88% → **uncrittable**. If it still shows 5.20%, run **`/tgs debug`** and
   send the output (tells us exactly which resilience CR index the client populates). Also confirm
   the Holy Shield toggle moves total avoidance / crush surplus by 30%.
2. **Phase B — CurseForge:** `.pkgmeta` + `BigWigsMods/packager` GitHub Action, swap the native
   UI for **Ace3**, `addon/PUBLISHING.md` (project id, `CF_API_KEY` secret — user-only steps).
3. **Phase C/D:** `bin/gen-lua-data.mjs` to generate `Constants.lua` (and later gem/enchant/BiS
   tables) from the JS; then port the optimizer to run in a **frame-yielding coroutine**.

### Open addon caveats (live readout)
- **hsBlockBonus** is 30/0 only; block-libram 35.32 needs relic-slot detection (deferred).
- **damageTakenMult** left at 1 (Imp RF −6% not auto-detected) — changes no pass/fail, only EHP.
- **DR/EHP vs WA** differs by design (level-73 boss); not a bug.

### Caveats
- **hsBlockBonus** is 30/0 only; block-libram 35.32 needs relic-slot detection (deferred).
- **damageTakenMult** left at 1 (Imp RF −6% not auto-detected); constant factor, changes no
  pass/fail, just the honest EHP number.
- **Ace3 deferred:** MVP UI is native frames so it loads on a bare folder-copy; Ace3 comes with
  the packager that embeds its libs (Phase B).

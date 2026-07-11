# What is Tankadin Gear Sim?

Tankadin Gear Sim is a free, open-source toolkit for **WoW TBC Classic (Anniversary
client) Protection Paladin** tanks, built by NPC6388. It answers the question every
tankadin actually asks: *given the gear I already own, what's the best set I can put
together right now?*

**Start in-game with the addon.** Install "Tankadin Gear Sim" (`/tgs`) and you get a
live tank readout off your character sheet — uncrittable and uncrushable status with
surplus, avoidance breakdown, armor DR, and physical EHP — that recomputes as you swap
pieces. Toggles let you assume Holy Shield and raid buffs (Kings + Mark of the Wild) so
the numbers match a real pull. It auto-detects your professions and faction.

**Optimize without leaving the game.** The in-game Optimize tab reads your bags and
bank and builds four tuned sets — Raid Threat, Survival, AOE Trash, and Balanced — with
per-goal EHP↔Threat and minimum-HP sliders. A minimap button opens an ItemRack-style
flyout to preview and equip any set in one click; it keeps your gems and enchants.

**Go deeper on the website.** Export your gear and upload it to the
[sim site](https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim/) for the same
optimization plus a gem/enchant solver, phase selection, and BiS "pretend I own this"
planning. Same engine — the Lua port is parity-tested against the JS.

All the math comes from
[Lollerskate's TBC Prot Paladin Tanking Guide](https://npc6388.github.io/wow-tbc-prot-paladin-guide/).
No hidden back-fitting: it's a first-principles forward calc that reproduces your
character sheet to rounding.

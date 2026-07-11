# Visual Identity

One product, three surfaces (in-game addon, sim website, guide link). Everything should
read as the same thing. This spec is the single source of truth for icon, color, type,
screenshots, badges, and naming.

## Icon motif

The shield. The addon `.toc` ships with the WoW icon
`Interface\Icons\INV_Shield_06` (`## IconTexture`) — a gold-trimmed kite shield. Reuse
that shield silhouette everywhere it helps: favicon, README hero, CurseForge thumbnail,
Discord/Reddit avatar. When you need a non-WoW-asset mark (favicon, social), draw a
simple gold kite shield on a dark slate field — do not restyle it into a sword, hammer,
or generic RPG crest. The shield reinforces "tank," which is the whole pitch.

## Color palette

Pulled verbatim from `web/style.css` (`:root` custom properties). Use these exact hex
values on every surface so the site, badges, and any generated art match.

| Token      | Hex       | Role                                            |
|------------|-----------|-------------------------------------------------|
| `--bg`     | `#15171c` | Page background (near-black slate)              |
| `--panel`  | `#1d2027` | Panel / card background                         |
| `--panel2` | `#23262f` | Nested panel, inputs, chips                     |
| `--line`   | `#2f333d` | Borders, dividers                               |
| `--text`   | `#e6e7ea` | Primary text (off-white)                        |
| `--muted`  | `#9aa0ab` | Secondary text, captions                        |
| `--gold`   | `#f0c674` | **Primary brand accent** — headings, logo, CTAs |
| `--accent` | `#5aa9e6` | Links, secondary buttons, active-step border    |
| `--good`   | `#6fcf6f` | Pass / uncrittable-OK / enchant green           |
| `--bad`    | `#e06d6d` | Fail / not-capped red                           |
| `--warn`   | `#e0b75a` | Warnings, "re-gem" hints, meta caveats          |

**Rules of thumb.** Dark slate backgrounds, never light. Gold (`#f0c674`) is the
signature — use it for the product name, primary buttons, and headings, and use it
sparingly so it stays special. Blue (`#5aa9e6`) is the interactive/secondary color.
Green/red are reserved for pass/fail status (uncrittable, uncrushable, gates) — don't
spend them on decoration.

## Typography

The site uses `"Segoe UI", system-ui, sans-serif` with tabular numerals
(`font-variant-numeric: tabular-nums`) for all stat readouts. Match it: system sans
everywhere, and keep numbers monospaced/tabular in tables and stat panels so columns
line up. Headings are gold; body is off-white on slate.

## Screenshot conventions

- **In-game shots:** capture at a common 16:9 size (1920×1080 preferred, 1280×720
  minimum). Crop tightly to the addon frame plus enough game background for context —
  no full-desktop clutter, no other addons dominating the frame. Show real numbers, not
  a stripped test character.
- **Website shots:** capture the browser viewport only (no OS chrome / bookmarks bar).
  Use the site's own dark theme as the backdrop so screenshots inherit the palette.
- **Format:** PNG for stills, GIF (or short MP4) for interactions like the minimap
  flyout equipping a set. Keep GIFs under ~5 MB and a few seconds long.
- **Storage:** all captured assets live in `docs/assets/` with the filenames from
  `docs/asset-checklist.md`. Reference them by relative path from README/site.

## README / badge style

- Keep badges to a tight, meaningful row: version (matches `.toc` `## Version`, e.g.
  `0.8.40`), license (MIT, per `## X-License`), interface build, and — once live — a
  CurseForge/GitHub Release badge. No vanity badges.
- Prefer flat-style badges tinted to the palette where a color is configurable: gold
  `#f0c674` for the brand/version badge, slate/gray for neutral ones. Don't scatter
  rainbow default colors.
- Lead the README with the shield + the product name in gold, then the one-line pitch,
  then the live-tool link — mirroring the site header.

## Naming & tone

- **Product name:** "Tankadin Gear Sim" (in-game addon title). The umbrella project is
  "Lollerskate's Tankadin Gear Sim." The community shorthand "tankadin" is fine and
  on-brand.
- **Author:** NPC6388. **License:** MIT.
- **The guide** ("Lollerskate's TBC Prot Paladin Tanking Guide") is a **separate
  external project** — always **link** it, never rehost its content.
- **Tone:** plain, precise, no hype, no emoji spam. Write for skeptical raiders who want
  the math to check out. State caps and assumptions (Holy Shield, raid buffs) explicitly
  rather than hand-waving. A single functional emoji (▶, ⬇, 📖) as a wayfinding marker is
  fine; walls of them are not.

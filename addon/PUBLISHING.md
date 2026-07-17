# Publishing TankadinGearSim to CurseForge

The addon is released by pushing a **`v*` git tag**. A GitHub Action
(`.github/workflows/release.yml`) then runs [`BigWigsMods/packager`](https://github.com/BigWigsMods/packager),
which reads `.pkgmeta` at the repo root, lifts `addon/TankadinGearSim/` into a clean package,
zips it, attaches it to a **GitHub Release**, and — once configured — uploads it to **CurseForge**.

## One-time setup (user-only — I can't do these for you)

These require your CurseForge/GitHub accounts, so they're on you:

1. **Create the CurseForge project.** On CurseForge, create a new World of Warcraft addon project
   for TankadinGearSim. Note its **numeric Project ID** (shown on the project page, e.g. `123456`).
2. **Put the Project ID in the `.toc`.** In `addon/TankadinGearSim/TankadinGearSim.toc`, uncomment
   the last line and set the id:
   ```
   ## X-Curse-Project-ID: 123456
   ```
   (Delete the leading `# ` so it becomes a real `##` directive.)
3. **Create a CurseForge API token.** CurseForge account → *API Tokens* → generate a token.
4. **Add it as a GitHub secret.** Repo → *Settings* → *Secrets and variables* → *Actions* →
   *New repository secret*, named **`CF_API_KEY`**, value = the token.

Until step 4 is done, the workflow still runs on a tag — it just **skips the CurseForge upload**
and only produces the GitHub Release zip. So it's safe to tag and test before the CurseForge side
is wired up.

## Cutting a release

1. Bump `## Version:` in the `.toc` and update `CHANGELOG.md` (and `SESSION_LOG.md`).
   Also update the **player-facing** `addon/TankadinGearSim/CHANGELOG.md` — it becomes the
   GitHub Release body and the CurseForge file changelog (`manual-changelog` in `.pkgmeta`).
   Don't remove that setting: without it the packager builds the notes from raw git history,
   which exceeded GitHub's 125k-char release-body limit on the first release.
2. Commit, then tag and push:
   ```
   git tag v0.8.2
   git push origin v0.8.2
   ```
   The tag name (minus the leading `v`) becomes the release version. For a **dry run**, the
   pre-release suffix MUST contain `alpha` or `beta` (e.g. `v0.8.2-beta1`) — those are the only
   two keywords the packager recognizes (`release.sh` tag classification). Anything else,
   including `-rc1`, is packaged as a **full stable release** and would go to CurseForge as the
   latest download. (Found out the hard way: `v0.8.45-rc5` published as stable and had to be
   flipped to pre-release by hand.)
3. Watch the **Actions** tab. On success you get a GitHub Release with the zip attached, and (if
   `CF_API_KEY` + Project ID are set) a new CurseForge file.

## Verifying a packaged build

Download the zip the workflow produced (from the GitHub Release) and confirm it extracts as
`AddOns/TankadinGearSim/` with the `.toc`, `engine/`, `Core.lua`, `UI.lua`, `Exporter.lua`, and
`TankadinGearSim.lua` all present. (No `Libs/` yet — the UI is native frames; Ace3 externals get
added to `.pkgmeta` when the UI is ported.) Drop it into the Anniversary client and `/tgs` to
smoke-test.

## Notes

- **Interface version.** `## Interface: 20504` goes stale each Anniversary content patch (addon
  shows "out of date"). Bump it when the client updates; consider listing multiple `## Interface:`
  values if we start supporting more than one build.
- **The website download button** currently serves the hand-committed `addon/TankadinGearSim.zip`
  (rebuilt via `Compress-Archive`, see `addon/README.md`). Once CurseForge releases are flowing,
  we can repoint it at the latest GitHub Release asset and retire the committed zip.
- **Ace3 UI is deferred.** The MVP UI uses native frames so the addon loads on a plain folder-copy
  with zero libs (good for in-game iteration). When it moves to Ace3, uncomment the `externals:`
  block in `.pkgmeta` so the packager embeds the libs into the released zip only.

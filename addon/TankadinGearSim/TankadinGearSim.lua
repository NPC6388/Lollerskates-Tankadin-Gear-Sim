-- Tankadin Gear Sim — addon entry point.
-- Sets the shared namespace + export format version, then registers slash commands. The heavy
-- lifting lives in the other files (loaded after this one; see the .toc):
--   engine/*  — ported sim math (Constants/Combat/Evaluate)
--   Core.lua  — reads the live character sheet and runs the evaluator
--   UI.lua    — the window (Live readout + Export tab)
--   Exporter.lua — the website hand-off string (unchanged format)
--
-- Commands:
--   /tgs            open the window (Live readout)
--   /tgs export     open the Export tab (website hand-off)
--   /tankadin       alias for /tgs

local ADDON, ns = ...

-- Export-string format version. Kept here so Exporter.lua (loaded next) picks it up as ns.VERSION.
ns.VERSION = "11"

SLASH_TANKADINGEARSIM1 = "/tgs"
SLASH_TANKADINGEARSIM2 = "/tankadin"
SlashCmdList["TANKADINGEARSIM"] = function(msg)
  msg = (msg or ""):lower():gsub("^%s+", ""):gsub("%s+$", "")
  if msg == "debug" then
    local text = ns.Core and ns.Core.debug and ns.Core.debug()
    if ns.UI and ns.UI.ShowDebug then ns.UI.ShowDebug(text) end
    return
  end
  if not ns.UI then return end
  if msg == "export" then
    ns.UI.Show("export")
  else -- "", "live", "eval", or anything else -> the live readout
    ns.UI.Show("live")
  end
end

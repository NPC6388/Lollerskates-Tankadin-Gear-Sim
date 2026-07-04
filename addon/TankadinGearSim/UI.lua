-- UI — the in-game window. Two tabs:
--   Live   — reads your equipped set live and shows crit/crush/EHP/avoidance + cap status.
--   Export — the website hand-off copy box (unchanged behaviour, now driven by ns.Exporter).
-- MVP uses native frames so the addon loads on a plain folder-copy with zero external libs.
-- (Ace3 is the intended UI once the CurseForge packager embeds the libs — see the plan's Phase B.)

local ADDON, ns = ...
ns.UI = ns.UI or {}
local UI = ns.UI
local Core, Exporter = ns.Core, ns.Exporter

UI.holyShield = true

local frame, tabs, panes, liveRows, exportEdit, exportInfo
local optCards, optStatus, optButton, optSubs
local optRun -- active async handle (so re-clicking cancels the prior run)

-- ---- formatting helpers ----
-- WeakAura-style palette: gold stat labels, cyan values, green/red for pass/fail, on the black bg.
local GOOD, BAD, DIM = "|cff7ee787", "|cffff6b6b", "|cff9aa0a6"
local GOLD, CYAN = "|cffd9b870", "|cff5fd0e6"
local TICK  = "|TInterface/RaidFrame/ReadyCheck-Ready:0|t"     -- built-in green check texture
local CROSS = "|TInterface/RaidFrame/ReadyCheck-NotReady:0|t"  -- built-in red cross texture
local function color(hex, s) return hex .. s .. "|r" end
local function pct(x) return string.format("%.2f%%", x or 0) end
local function num(x) return tostring(math.floor((x or 0) + 0.5)) end
local function mark(ok) return ok and TICK or CROSS end

-- Build one compact "Label   value" row (WeakAura-style stat stack): gold label at the left, the
-- value column just to its right. Returns the value fontstring to update in Refresh.
local function statRow(pane, y, label)
  local l = pane:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  l:SetPoint("TOPLEFT", 14, y)
  l:SetText(color(GOLD, label))
  local v = pane:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  v:SetPoint("TOPLEFT", 118, y)
  v:SetJustifyH("LEFT")
  v:SetWidth(168)
  return v
end

local function buildFrame()
  frame = CreateFrame("Frame", "TGSMainFrame", UIParent, "BackdropTemplate")
  frame:SetSize(300, 404) -- compact by default (Live tab); widened for the Export tab in UI.Select
  frame:SetPoint("CENTER")
  frame:SetFrameStrata("DIALOG")
  frame:EnableMouse(true)
  frame:SetMovable(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
  local bg = frame:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(); bg:SetColorTexture(0, 0, 0, 0.9)

  local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOP", 0, -10); title:SetText("Tankadin Gear Sim")
  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", 2, 2)

  -- ---- tab buttons ----
  tabs, panes = {}, {}
  local function makeTab(key, label, x)
    local b = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
    b:SetSize(90, 22); b:SetPoint("TOPLEFT", x, -34); b:SetText(label)
    b:SetScript("OnClick", function() UI.Select(key) end)
    tabs[key] = b
    local p = CreateFrame("Frame", nil, frame)
    p:SetPoint("TOPLEFT", 8, -62); p:SetPoint("BOTTOMRIGHT", -8, 12)
    p:Hide()
    panes[key] = p
    return p
  end

  -- ---- Live pane (compact WeakAura-style stat stack) ----
  local live = makeTab("live", "Live", 12)
  local hs = CreateFrame("CheckButton", nil, live, "UICheckButtonTemplate")
  hs:SetPoint("TOPLEFT", 10, -4); hs:SetSize(20, 20); hs:SetChecked(UI.holyShield)
  local hsLabel = hs:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  hsLabel:SetPoint("LEFT", hs, "RIGHT", 2, 0)
  hsLabel:SetText("Assume Holy Shield up")
  hs:SetScript("OnClick", function(self) UI.holyShield = self:GetChecked() and true or false; UI.Refresh() end)

  liveRows = {}
  local y = -32
  local function row(key, label) liveRows[key] = statRow(live, y, label); y = y - 17 end
  local function gap() y = y - 9 end
  row("miss",  "Miss")
  row("dodge", "Dodge")
  row("parry", "Parry")
  row("avoid", "Avoid")
  row("block", "Block")
  gap()
  row("crit",  "Crit")
  row("critH", "\194\183 heroic")
  row("crush", "Crush")
  gap()
  row("bv",    "Block value")
  row("armor", "Armor")
  row("dr",    "Armor DR")
  row("ehp",   "EHP / HP")
  gap()
  row("sp",    "Spell power")
  local note = live:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  note:SetPoint("BOTTOMLEFT", 10, 6); note:SetPoint("BOTTOMRIGHT", -8, 6); note:SetJustifyH("LEFT")
  note:SetText("Live set vs a lvl-73 boss. Avoid = miss+dodge+parry; EHP is raw HP behind armor.")

  -- ---- Optimize pane (runs the in-game four-set optimizer across frames) ----
  local opt = makeTab("optimize", "Optimize", 204)
  optButton = CreateFrame("Button", nil, opt, "UIPanelButtonTemplate")
  optButton:SetSize(96, 22); optButton:SetPoint("TOPLEFT", 8, -4); optButton:SetText("Optimize")
  optButton:SetScript("OnClick", function() UI.Optimize() end)
  optStatus = opt:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  optStatus:SetPoint("LEFT", optButton, "RIGHT", 8, 0); optStatus:SetJustifyH("LEFT"); optStatus:SetWidth(300)
  optStatus:SetText(color(DIM, "Reads your worn + bag + (open) bank gear."))
  -- Four goal cards (name + gate chip, then two stat lines each).
  optCards = {}
  local cy = -34
  for i = 1, 4 do
    local head = opt:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    head:SetPoint("TOPLEFT", 10, cy); head:SetJustifyH("LEFT"); head:SetWidth(410)
    local l2 = opt:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    l2:SetPoint("TOPLEFT", 16, cy - 18); l2:SetJustifyH("LEFT"); l2:SetWidth(404)
    local l3 = opt:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    l3:SetPoint("TOPLEFT", 16, cy - 34); l3:SetJustifyH("LEFT"); l3:SetWidth(404)
    optCards[i] = { head = head, l2 = l2, l3 = l3 }
    cy = cy - 62
  end
  optSubs = opt:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  optSubs:SetPoint("BOTTOMLEFT", 10, 6); optSubs:SetPoint("BOTTOMRIGHT", -8, 6); optSubs:SetJustifyH("LEFT")
  optSubs:SetText("Buffs: Kings + Mark of the Wild. Professions & faction auto-detected. Re-gems for each goal.")

  -- ---- Export pane ----
  local ex = makeTab("export", "Export", 108)
  exportInfo = ex:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  exportInfo:SetPoint("TOPLEFT", 8, -4); exportInfo:SetJustifyH("LEFT"); exportInfo:SetWidth(560)
  exportInfo:SetText("Ctrl+A, Ctrl+C, then paste into the website sim. Open your bank first for banked gear.")
  local scroll = CreateFrame("ScrollFrame", "TGSExportScroll", ex, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 8, -28); scroll:SetPoint("BOTTOMRIGHT", -28, 8)
  exportEdit = CreateFrame("EditBox", nil, scroll)
  exportEdit:SetMultiLine(true); exportEdit:SetFontObject(ChatFontNormal)
  exportEdit:SetWidth(530); exportEdit:SetAutoFocus(false); exportEdit:SetMaxLetters(0)
  exportEdit:SetScript("OnEscapePressed", function() frame:Hide() end)
  scroll:SetScrollChild(exportEdit)
end

-- Populate the Live pane from a fresh snapshot.
function UI.Refresh()
  if not frame or not panes.live:IsShown() then return end
  local snap = Core.snapshot({ holyShield = UI.holyShield })
  local e, i = snap.evald, snap.input
  local R = liveRows

  -- Avoidance (Avoid = miss+dodge+parry; Block is the effective, HS-inclusive figure).
  R.miss:SetText(color(CYAN, pct(i.missPct)))
  R.dodge:SetText(color(CYAN, pct(i.dodgePct)))
  R.parry:SetText(color(CYAN, pct(i.parryPct)))
  R.avoid:SetText(color(CYAN, pct(e.actualAvoidance)))
  R.block:SetText(color(CYAN, pct(i.blockPctEffective or i.blockPct)))

  -- Caps: crit reduction vs raid/heroic, combined avoidance vs the 102.4% crush cap.
  R.crit:SetText(color(e.raidCritImmune and GOOD or BAD, pct(e.critReduction)) ..
    color(DIM, " / 5.6%") .. " " .. mark(e.raidCritImmune))
  R.critH:SetText(color(DIM, pct(e.critReduction) .. " / 5.4%") .. " " .. mark(e.heroicCritImmune))
  R.crush:SetText(color(e.uncrushable and GOOD or BAD, pct(e.totalAvoidanceWithHS)) ..
    color(DIM, " / 102.4%") .. " " .. mark(e.uncrushable))

  -- Mitigation + throughput.
  R.bv:SetText(color(CYAN, num(e.blockValue)))
  R.armor:SetText(color(CYAN, num(i.armor)))
  R.dr:SetText(color(CYAN, pct(ns.engine.Combat.armorDR(i.armor) * 100)))
  R.ehp:SetText((e.ehpPhysical and color(CYAN, num(e.ehpPhysical)) or color(DIM, "n/a")) ..
    color(DIM, " / ") .. color(CYAN, num(e.health)))
  R.sp:SetText(color(CYAN, num(e.spellPower)))
end

-- Fill the Export pane's copy box (and flush SavedVariables) on demand.
local function refreshExport()
  if not Exporter or not Exporter.run then return end
  local text, count = Exporter.run()
  exportEdit:SetText(text or "")
  exportEdit:SetCursorPosition(0)
  exportInfo:SetText(string.format("Exported %d items + character. Ctrl+A, Ctrl+C, paste into the " ..
    "website. Type /reload to flush it to SavedVariables on disk.", count or 0))
end

-- Read the player's two professions, mapped to our names (for jcGems / ring-enchant / enchant gating).
local function detectProfessions()
  local out = {}
  if type(GetProfessions) ~= "function" or type(GetProfessionInfo) ~= "function" then return out end
  local known = {}
  for _, n in ipairs(ns.engine.Professions.PROFESSION_NAMES) do known[n] = true end
  local ok, p1, p2 = pcall(GetProfessions)
  if not ok then return out end
  for _, idx in ipairs({ p1 or false, p2 or false }) do
    if idx then
      local ok2, name = pcall(GetProfessionInfo, idx)
      if ok2 and name and known[name] then out[#out + 1] = name end
    end
  end
  return out
end

-- Render the four goal results into the cards.
local function renderOptimize(results)
  for i, card in ipairs(optCards) do
    local r = results[i]
    if not r then
      card.head:SetText(""); card.l2:SetText(""); card.l3:SetText("")
    else
      local e, a = r.evald, r.agg
      local legalTxt = r.legal and color(GOOD, "legal") or color(BAD, "illegal")
      if r.hpBestEffort then legalTxt = color(BAD, "HP unreachable") end
      card.head:SetText(color(GOLD, r.goal.name) .. "   " .. mark(r.legal) .. " " .. legalTxt
        .. color(DIM, "   " .. (r.goal.focus or "")))
      card.l2:SetText(
        color(GOLD, "SP ") .. color(CYAN, num(a.spellPowerLiteral or a.spellPower))
        .. color(GOLD, "   Uncrush ") .. color(e.uncrushable and GOOD or BAD, pct(e.totalAvoidanceWithHS))
        .. color(GOLD, "   Crit ") .. color(e.raidCritImmune and GOOD or BAD, pct(e.critReduction)))
      card.l3:SetText(
        color(GOLD, "EHP ") .. color(CYAN, num(e.ehpPhysical)) .. color(DIM, " / ") .. color(CYAN, num(e.health))
        .. color(GOLD, "   Avoid ") .. color(CYAN, pct(e.actualAvoidance))
        .. color(GOLD, "   Block ") .. color(CYAN, num(e.blockValue)))
    end
  end
end

-- Scan owned gear, auto-detect professions/faction, and run the optimizer across frames.
function UI.Optimize()
  if not frame then buildFrame() end
  if not ns.Async or not ns.ItemPool then
    optStatus:SetText(color(BAD, "Optimizer not loaded.")); return
  end
  if optRun and optRun.isRunning and optRun.isRunning() then optRun.cancel() end
  for _, c in ipairs(optCards) do c.head:SetText(""); c.l2:SetText(""); c.l3:SetText("") end

  local items = ns.ItemPool.scan()
  local faction = ns.engine.Enchants and ns.engine.Enchants.detectFaction(items) or nil
  local professions = detectProfessions()
  local profTxt = (#professions > 0) and table.concat(professions, "+") or "none"
  optStatus:SetText(color(DIM, string.format("%d items · %s · %s · solving...",
    #items, profTxt, faction or "both factions")))

  optButton:SetEnabled(false)
  optRun = ns.Async.optimizeSets(items,
    { buff = "raid", professions = professions, faction = faction },
    function(results) -- onDone
      optButton:SetEnabled(true)
      renderOptimize(results)
      optStatus:SetText(color(GOOD, string.format("Done · %d items · %s · %s",
        #items, profTxt, faction or "both factions")))
    end,
    function(done, total) -- onProgress
      optStatus:SetText(color(DIM, string.format("Solving %d/%d...", done, total)))
    end,
    function(err) -- onError
      optButton:SetEnabled(true)
      optStatus:SetText(color(BAD, "Error: " .. tostring(err)))
    end)
end

function UI.Select(key)
  if not frame then buildFrame() end
  -- Live is a compact WeakAura-style column; Export + Optimize need more room.
  if key == "export" then frame:SetSize(600, 440)
  elseif key == "optimize" then frame:SetSize(440, 366)
  else frame:SetSize(300, 404) end
  for k, p in pairs(panes) do
    p:SetShown(k == key)
    tabs[k]:SetEnabled(k ~= key)
  end
  if key == "export" then refreshExport() else UI.Refresh() end
end

function UI.Show(key)
  if not frame then buildFrame() end
  frame:Show()
  UI.Select(key or "live")
end

-- Drop arbitrary text (e.g. /tgs debug output) into the Export copy box for Ctrl+C, without the
-- gear-string refresh that selecting the Export tab normally triggers.
function UI.ShowDebug(text)
  if not frame then buildFrame() end
  frame:Show()
  frame:SetSize(600, 440)
  for k, p in pairs(panes) do
    p:SetShown(k == "export")
    tabs[k]:SetEnabled(k ~= "export")
  end
  exportEdit:SetText(text or "")
  exportEdit:SetCursorPosition(0)
  exportInfo:SetText("/tgs debug output — Ctrl+A, Ctrl+C to copy. Click the Export tab to regenerate the gear string.")
end

function UI.Toggle(key)
  if frame and frame:IsShown() and (not key or panes[key]:IsShown()) then
    frame:Hide()
  else
    UI.Show(key)
  end
end

-- Live-refresh when gear/stats change while the window is open.
if Core and Core.onChange then Core.onChange(function() UI.Refresh() end) end

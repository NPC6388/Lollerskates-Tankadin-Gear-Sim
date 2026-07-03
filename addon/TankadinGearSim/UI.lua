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

function UI.Select(key)
  if not frame then buildFrame() end
  -- Live is a compact WeakAura-style column; Export needs room for the copy box.
  if key == "export" then frame:SetSize(600, 440) else frame:SetSize(300, 404) end
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

function UI.Toggle(key)
  if frame and frame:IsShown() and (not key or panes[key]:IsShown()) then
    frame:Hide()
  else
    UI.Show(key)
  end
end

-- Live-refresh when gear/stats change while the window is open.
if Core and Core.onChange then Core.onChange(function() UI.Refresh() end) end

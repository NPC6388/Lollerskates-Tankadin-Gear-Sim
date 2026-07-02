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
local GOOD, BAD, DIM = "|cff7ee787", "|cffff6b6b", "|cff9aa0a6"
local function color(hex, s) return hex .. s .. "|r" end
local function pct(x) return string.format("%.2f%%", x or 0) end
local function num(x) return tostring(math.floor((x or 0) + 0.5)) end
local function signed(x) return string.format("%+.2f%%", x or 0) end

-- Build one "Label: value" row in a pane; returns the value fontstring to update later.
local function addRow(pane, y, label)
  local l = pane:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  l:SetPoint("TOPLEFT", 14, y)
  l:SetText(label)
  local v = pane:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  v:SetPoint("TOPLEFT", 190, y)
  v:SetJustifyH("LEFT")
  v:SetWidth(300)
  return v
end

local function buildFrame()
  frame = CreateFrame("Frame", "TGSMainFrame", UIParent, "BackdropTemplate")
  frame:SetSize(540, 430)
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

  -- ---- Live pane ----
  local live = makeTab("live", "Live", 12)
  local hs = CreateFrame("CheckButton", nil, live, "UICheckButtonTemplate")
  hs:SetPoint("TOPLEFT", 10, -6); hs:SetChecked(UI.holyShield)
  local hsLabel = hs:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  hsLabel:SetPoint("LEFT", hs, "RIGHT", 2, 0)
  hsLabel:SetText("Assume Holy Shield up (+30% block)")
  hs:SetScript("OnClick", function(self) UI.holyShield = self:GetChecked() and true or false; UI.Refresh() end)

  liveRows = {}
  local y = -40
  local function row(key, label) liveRows[key] = addRow(live, y, label); y = y - 20 end
  row("crit",     "Crit reduction")
  row("raidCrit", "Raid (lvl 73, need 5.6%)")
  row("heroCrit", "Heroic (lvl 72, need 5.4%)")
  y = y - 6
  row("avoid",    "Avoidance (miss/dodge/parry/block)")
  row("noHS",     "Total avoidance (no Holy Shield)")
  row("withHS",   "Total avoidance (Holy Shield)")
  row("crush",    "Uncrushable (need 102.4%)")
  y = y - 6
  row("armor",    "Armor DR")
  row("health",   "Health")
  row("ehp",      "Physical EHP")
  row("sp",       "Spell power")
  row("bv",       "Block value")
  local note = live:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  note:SetPoint("BOTTOMLEFT", 10, 4); note:SetJustifyH("LEFT"); note:SetWidth(500)
  note:SetText("Reads your equipped set live. Values match the website to rounding. " ..
    "EHP is raw HP behind armor (avoidance valued separately).")

  -- ---- Export pane ----
  local ex = makeTab("export", "Export", 108)
  exportInfo = ex:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  exportInfo:SetPoint("TOPLEFT", 8, -4); exportInfo:SetJustifyH("LEFT"); exportInfo:SetWidth(500)
  exportInfo:SetText("Ctrl+A, Ctrl+C, then paste into the website sim. Open your bank first for banked gear.")
  local scroll = CreateFrame("ScrollFrame", "TGSExportScroll", ex, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 8, -28); scroll:SetPoint("BOTTOMRIGHT", -28, 8)
  exportEdit = CreateFrame("EditBox", nil, scroll)
  exportEdit:SetMultiLine(true); exportEdit:SetFontObject(ChatFontNormal)
  exportEdit:SetWidth(470); exportEdit:SetAutoFocus(false); exportEdit:SetMaxLetters(0)
  exportEdit:SetScript("OnEscapePressed", function() frame:Hide() end)
  scroll:SetScrollChild(exportEdit)
end

-- Populate the Live pane from a fresh snapshot.
function UI.Refresh()
  if not frame or not panes.live:IsShown() then return end
  local snap = Core.snapshot({ holyShield = UI.holyShield })
  local e = snap.evald
  local R = liveRows
  R.crit:SetText(pct(e.critReduction))
  R.raidCrit:SetText((e.raidCritImmune and color(GOOD, "YES") or color(BAD, "NO")) ..
    "  (" .. signed(e.raidCritSurplus) .. ")")
  R.heroCrit:SetText((e.heroicCritImmune and color(GOOD, "YES") or color(BAD, "NO")) ..
    "  (" .. signed(e.heroicCritSurplus) .. ")")
  R.avoid:SetText(string.format("%s / %s / %s / %s",
    pct(snap.input.missPct), pct(snap.input.dodgePct), pct(snap.input.parryPct), pct(snap.input.blockPct)))
  R.noHS:SetText(pct(e.totalAvoidanceNoHS))
  R.withHS:SetText(pct(e.totalAvoidanceWithHS))
  R.crush:SetText((e.uncrushable and color(GOOD, "YES") or color(BAD, "NO")) ..
    "  (" .. signed(e.crushSurplus) .. ")")
  R.armor:SetText(pct((ns.engine.Combat.armorDR(snap.input.armor)) * 100))
  R.health:SetText(num(e.health))
  R.ehp:SetText(e.ehpPhysical and num(e.ehpPhysical) or color(DIM, "n/a"))
  R.sp:SetText(num(e.spellPower))
  R.bv:SetText(num(e.blockValue))
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

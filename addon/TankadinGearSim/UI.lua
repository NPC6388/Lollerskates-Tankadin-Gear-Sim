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
-- Live readout assumes Kings + MotW by default (the optimizer always does), so a set built to be
-- uncrushable/hit its EHP floor when raid-buffed doesn't read short while you're standing unbuffed.
UI.assumeBuffs = true

-- Per-tab MINIMUM frame size (w, h) — sized so each tab's text never overlaps. The user can drag the
-- bottom-right grip to grow the frame; that chosen size (persisted in TankadinGearSimUI) is reused
-- across tabs, clamped up to each tab's minimum. Optimize needs the most room (four goal cards).
local TAB_MIN = {
  live     = { 300, 420 },
  optimize = { 470, 726 },
  export   = { 470, 260 },
}

local frame, tabs, panes, liveRows, exportInfo, exportSteps
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

-- ---- Goal tuning (EHP <-> Threat sliders) ----
-- Mirrors the full sim's per-goal slider: a value v in [-3,3] sets the EHP:Threat ratio the objective
-- blends (v>0 leans threat, v<0 leans EHP). The DEFAULTS below match the website's default slider
-- positions (raid v=3 -> ehp:1 threat:4, etc.), so the addon's out-of-the-box sets now agree with the
-- site's instead of being systematically tankier (its old hardcoded ratios were ehp:1 threat:2). Min-HP
-- floors also match the site's defaults so leaning threat doesn't quietly drop below a raid-buffed HP wall.
local SLIDER_GOALS = { "raid", "survival", "aoe", "balanced" }
local GOAL_SIDES = {
  raid     = { left = "ehp", right = "threat",    rlabel = "Threat" },
  survival = { left = "ehp", right = "threat",    rlabel = "Threat" },
  aoe      = { left = "ehp", right = "aoeThreat", rlabel = "AOEThr" },
  balanced = { left = "ehp", right = "threat",    rlabel = "Threat" },
}
local GOAL_FULLNAME = { raid = "Raid Threat", survival = "Survival", aoe = "AOE Trash", balanced = "Balanced" }
-- Defaults = the user's preferred slider stops (raid 1:4, aoe 1:4, survival 1:1, balanced 1:1).
local GOAL_V_DEFAULT = { raid = 3, survival = 0, aoe = 3, balanced = 0 }
local MINHP = { min = 10000, max = 20000, step = 500 } -- mirrors web/app.js
UI.goalV     = UI.goalV     or { raid = 3, survival = 0, aoe = 3, balanced = 0 }
UI.goalMinHP = UI.goalMinHP or { raid = 11500, survival = 14000, aoe = 10500, balanced = 12500 }

local function fmtW(w)
  if w == math.floor(w) then return tostring(math.floor(w)) end
  return string.format("%.1f", w)
end
-- ratioFor(id, v) -> the {ehp=..,threat/aoeThreat=..} table blendScale expects. Same math as web/app.js.
local function ratioFor(id, v)
  local s = GOAL_SIDES[id]
  local Lw = (v < 0) and (1 - v) or 1
  local Rw = (v > 0) and (1 + v) or 1
  return { [s.left] = Lw, [s.right] = Rw }, Lw, Rw
end
local function ratioText(id, v)
  local _, Lw, Rw = ratioFor(id, v)
  return string.format("EHP %s : %s %s", fmtW(Lw), fmtW(Rw), GOAL_SIDES[id].rlabel)
end
-- Compact "L:R" for the slider readout (the goal name + ◂EHP / Threat▸ arrows give the direction).
local function ratioShort(id, v)
  local _, Lw, Rw = ratioFor(id, v)
  return fmtW(Lw) .. ":" .. fmtW(Rw)
end

-- Full sim site. WoW can't open a browser from an addon, so the footer link pops a small dialog with
-- the URL pre-selected for Ctrl+C.
local SITE_URL = "https://npc6388.github.io/Lollerskates-Tankadin-Gear-Sim"
StaticPopupDialogs["TGS_COPY_URL"] = {
  text = "Full Tankadin Gear Sim — Ctrl+C to copy, then paste into your browser:",
  button1 = OKAY or "Close",
  hasEditBox = true, editBoxWidth = 260,
  OnShow = function(self)
    local eb = self.editBox or (self.GetName and _G[(self:GetName() or "") .. "EditBox"])
    if eb then eb:SetText(SITE_URL); eb:HighlightText(); eb:SetFocus() end
  end,
  EditBoxOnEnterPressed = function(self) self:GetParent():Hide() end,
  EditBoxOnEscapePressed = function(self) self:GetParent():Hide() end,
  timeout = 0, whileDead = true, hideOnEscape = true,
}

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

local function fmtHp(h) if h <= MINHP.min then return "off" end return string.format("%.1fk", h / 1000) end

-- A left/right nudge button using WoW's built-in spellbook page-turn arrow textures (reliable
-- left/right glyphs on this client — no font-dependent characters). dir<0 = left (prev), dir>0 = right.
local function arrowButton(pane, dir, onClick)
  local b = CreateFrame("Button", nil, pane)
  b:SetSize(18, 18)
  local base = (dir < 0) and "Interface\\Buttons\\UI-SpellbookIcon-PrevPage"
                          or "Interface\\Buttons\\UI-SpellbookIcon-NextPage"
  b:SetNormalTexture(base .. "-Up")
  b:SetPushedTexture(base .. "-Down")
  b:SetDisabledTexture(base .. "-Disabled")
  b:SetHighlightTexture("Interface\\Buttons\\UI-Common-MouseHilight", "ADD")
  b:SetScript("OnClick", onClick)
  return b
end

-- One tuning control laid out like the user's mockup: a 3-part label line ABOVE the slider —
-- left axis (e.g. "EHP"), centered live value (e.g. "1:4"), right axis (e.g. "Threat") — then a bare
-- slider (Low/High/Text captions stripped) flanked by ◄ / ► arrow buttons. `x,y` = top-left of the label
-- line; the slider sits 16px below. `format(val)` builds the centre value; `apply(val)` stores state.
local sliderSeq = 0
local function tuneSlider(pane, x, y, cfg)
  local w = cfg.sliderW or 120
  local sliderX = x + 19 -- room for the left arrow button
  sliderSeq = sliderSeq + 1
  local sname = "TGSTune" .. sliderSeq
  local s = CreateFrame("Slider", sname, pane, "OptionsSliderTemplate")
  s:SetPoint("TOPLEFT", sliderX, y - 16); s:SetWidth(w); s:SetHeight(16)
  s:SetMinMaxValues(cfg.min, cfg.max); s:SetValueStep(cfg.step); s:SetObeyStepOnDrag(true)
  for _, suf in ipairs({ "Low", "High", "Text" }) do
    local r = _G[sname .. suf] or s[suf]; if r then r:SetText(""); r:Hide() end
  end
  local left = arrowButton(pane, -1, function() s:SetValue(s:GetValue() - cfg.step) end)
  left:SetPoint("RIGHT", s, "LEFT", -1, 0)
  local right = arrowButton(pane, 1, function() s:SetValue(s:GetValue() + cfg.step) end)
  right:SetPoint("LEFT", s, "RIGHT", 1, 0)
  -- 3-part label line: left/centre/right share the slider's width box, differing only in justify, so a
  -- short left axis, a centred value and a right axis never collide as long as they don't overflow w.
  local function lbl(justify, hex, txt)
    local f = pane:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    f:SetPoint("TOPLEFT", sliderX, y); f:SetWidth(w); f:SetJustifyH(justify)
    if txt then f:SetText(color(hex, txt)) end
    return f
  end
  lbl("LEFT", DIM, cfg.leftLabel)
  lbl("RIGHT", DIM, cfg.rightLabel)
  local centre = lbl("CENTER", CYAN, nil)
  local function setV(val) centre:SetText(color(CYAN, cfg.format(val))) end
  s:SetScript("OnValueChanged", function(self, val) cfg.apply(val); setV(val) end)
  s:SetValue(cfg.value); cfg.apply(cfg.value); setV(cfg.value)
  return s
end

-- One goal's tuning block (mockup layout): the goal name on its own line, then two labelled sliders
-- below it — "EHP | <ratio> | Threat" and "off | <floor> | 20k" — each with ◄ / ► arrow buttons.
-- Nudging/dragging updates UI.goalV / UI.goalMinHP, which the next Optimize click uses.
local function goalSlider(pane, y, id)
  local name = pane:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  name:SetPoint("TOPLEFT", 12, y); name:SetText(color(GOLD, GOAL_FULLNAME[id]))
  local ly = y - 18 -- the two sliders' label lines (each slider is 16 below its labels)
  tuneSlider(pane, 8, ly, {
    min = -3, max = 3, step = 0.5, value = UI.goalV[id] or 0,
    leftLabel = "EHP", rightLabel = "Threat", sliderW = 120,
    format = function(val) return ratioShort(id, val) end,
    apply = function(val) UI.goalV[id] = val end,
  })
  tuneSlider(pane, 190, ly, {
    min = MINHP.min, max = MINHP.max, step = MINHP.step, value = UI.goalMinHP[id] or MINHP.min,
    leftLabel = "off", rightLabel = "20k", sliderW = 120,
    format = function(val) return fmtHp(val) end,
    apply = function(val) UI.goalMinHP[id] = val end,
  })
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

  -- ---- resize: bottom-right grip, per-tab minimum (see TAB_MIN) so text can't be squeezed to overlap ----
  frame:SetResizable(true)
  local grip = CreateFrame("Button", nil, frame)
  grip:SetSize(16, 16); grip:SetPoint("BOTTOMRIGHT", -3, 3)
  grip:SetNormalTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Up")
  grip:SetHighlightTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Highlight")
  grip:SetPushedTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Down")
  grip:SetScript("OnMouseDown", function() frame:StartSizing("BOTTOMRIGHT") end)
  grip:SetScript("OnMouseUp", function()
    frame:StopMovingOrSizing()
    local w, h = frame:GetSize()
    TankadinGearSimUI = TankadinGearSimUI or {}
    TankadinGearSimUI.w, TankadinGearSimUI.h = math.floor(w + 0.5), math.floor(h + 0.5)
  end)

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
  -- Assume Kings + MotW: previews the raid-buffed dodge/EHP the optimizer targets, so an unbuffed
  -- readout of a raid-buffed set doesn't look crushable / under its HP floor. On by default (like HS).
  local bf = CreateFrame("CheckButton", nil, live, "UICheckButtonTemplate")
  bf:SetPoint("TOPLEFT", 10, -24); bf:SetSize(20, 20); bf:SetChecked(UI.assumeBuffs)
  local bfLabel = bf:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  bfLabel:SetPoint("LEFT", bf, "RIGHT", 2, 0)
  bfLabel:SetText("Assume Kings + MotW")
  bf:SetScript("OnClick", function(self) UI.assumeBuffs = self:GetChecked() and true or false; UI.Refresh() end)

  liveRows = {}
  local y = -50
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
  row("shit",  "Spell hit")
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
  -- Force YOUR equipped trinkets into every set (Survival drops the 2nd for a defensive pick). The model
  -- can't score proc/on-use trinkets, so without this the optimizer swaps them out for scoreable ones. On
  -- by default; uncheck to let the optimizer pick trinkets freely.
  UI.lockTrinkets = (UI.lockTrinkets ~= false)
  local lockTr = CreateFrame("CheckButton", nil, opt, "UICheckButtonTemplate")
  lockTr:SetPoint("TOPLEFT", 8, -28); lockTr:SetSize(20, 20); lockTr:SetChecked(UI.lockTrinkets)
  local lockLabel = lockTr:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  lockLabel:SetPoint("LEFT", lockTr, "RIGHT", 2, 0)
  lockLabel:SetText("Keep my equipped trinkets in the sets")
  lockTr:SetScript("OnClick", function(self) UI.lockTrinkets = self:GetChecked() and true or false end)
  -- Optimize assuming Kings + MotW (default on, matching the full sim). Off gears WITHOUT the raid
  -- buffs, so the sets must reach the crush cap from gear alone — tankier, a little less spell power.
  UI.optBuffs = (UI.optBuffs ~= false)
  local optBf = CreateFrame("CheckButton", nil, opt, "UICheckButtonTemplate")
  optBf:SetPoint("TOPLEFT", 8, -48); optBf:SetSize(20, 20); optBf:SetChecked(UI.optBuffs)
  local optBfLabel = optBf:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  optBfLabel:SetPoint("LEFT", optBf, "RIGHT", 2, 0)
  optBfLabel:SetText("Optimize with Kings + MotW (raid buffs)")
  optBf:SetScript("OnClick", function(self) UI.optBuffs = self:GetChecked() and true or false end)
  -- Per-goal tuning: a "threat" slider (EHP<->Threat lean — right = more SP / spell hit) and an "hp min"
  -- floor slider under each goal name. Click a label to nudge or drag the slider; the next Optimize uses them.
  local tuneHdr = opt:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  tuneHdr:SetPoint("TOPLEFT", 8, -70)
  tuneHdr:SetText(color(DIM, "Goal tuning — threat ratio (right = more SP / spell hit) & Min-HP floor:"))
  local sy = -88
  for _, id in ipairs(SLIDER_GOALS) do
    pcall(goalSlider, opt, sy, id) -- contain any template issue so the whole Optimize tab still builds
    sy = sy - 56 -- three lines per goal (name, then the labelled threat + hp-min sliders)
  end
  -- Four goal cards (name + gate chip, then two stat lines each).
  -- Cards span the pane width (so a wider frame shows more) and NEVER wrap — long lines clip at the
  -- right edge instead of wrapping onto the next card's line (the overlap bug). SetWordWrap(false)
  -- plus the enforced per-tab minimum height keeps every card's 3 lines clear of each other + footer.
  optCards = {}
  local cy = -320
  for i = 1, 4 do
    local head = opt:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    head:SetPoint("TOPLEFT", opt, "TOPLEFT", 10, cy); head:SetPoint("TOPRIGHT", opt, "TOPRIGHT", -8, cy)
    head:SetJustifyH("LEFT"); head:SetWordWrap(false)
    local l2 = opt:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    l2:SetPoint("TOPLEFT", opt, "TOPLEFT", 16, cy - 18); l2:SetPoint("TOPRIGHT", opt, "TOPRIGHT", -8, cy - 18)
    l2:SetJustifyH("LEFT"); l2:SetWordWrap(false)
    local l3 = opt:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    l3:SetPoint("TOPLEFT", opt, "TOPLEFT", 16, cy - 34); l3:SetPoint("TOPRIGHT", opt, "TOPRIGHT", -8, cy - 34)
    l3:SetJustifyH("LEFT"); l3:SetWordWrap(false)
    optCards[i] = { head = head, l2 = l2, l3 = l3 }
    cy = cy - 62
  end
  optSubs = opt:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  optSubs:SetPoint("BOTTOMLEFT", 10, 6); optSubs:SetPoint("BOTTOMRIGHT", -22, 6); optSubs:SetJustifyH("LEFT")
  optSubs:SetText("Keeps your completed gems/enchants (no re-gem); professions & faction auto-detected.\n"
    .. color(CYAN, "Re-gem & content-phase options at the full sim: npc6388.github.io/Lollerskates-Tankadin-Gear-Sim"))
  -- The footer's a plain FontString (can't be Ctrl+C'd in-game), so a transparent button over it pops a
  -- dialog with the URL pre-selected to copy — WoW can't open a browser from an addon.
  local siteLink = CreateFrame("Button", nil, opt)
  siteLink:SetAllPoints(optSubs)
  siteLink:SetScript("OnClick", function() StaticPopup_Show("TGS_COPY_URL") end)
  siteLink:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_TOP")
    GameTooltip:AddLine("Click to copy the full sim's web address")
    GameTooltip:Show()
  end)
  siteLink:SetScript("OnLeave", function() GameTooltip:Hide() end)

  -- ---- Export pane (upload-only) ----
  -- No copy box: a full 200-item export is far too large for a WoW EditBox to store or render (it just
  -- came up blank). Opening this tab writes the export to SavedVariables; the website ingests the .lua
  -- file. exportInfo = status line, exportSteps = the upload instructions (also reused by /tgs debug).
  local ex = makeTab("export", "Export", 108)
  exportInfo = ex:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  exportInfo:SetPoint("TOPLEFT", 10, -6); exportInfo:SetPoint("TOPRIGHT", -10, -6); exportInfo:SetJustifyH("LEFT")
  exportSteps = ex:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  exportSteps:SetPoint("TOPLEFT", 12, -30); exportSteps:SetPoint("BOTTOMRIGHT", -12, 10)
  exportSteps:SetJustifyH("LEFT"); exportSteps:SetJustifyV("TOP"); exportSteps:SetSpacing(6)
end

-- Populate the Live pane from a fresh snapshot.
function UI.Refresh()
  if not frame or not panes.live:IsShown() then return end
  local snap = Core.snapshot({ holyShield = UI.holyShield, assumeBuffs = UI.assumeBuffs })
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
  R.shit:SetText(color(CYAN, pct(i.spellHitPct)) .. color(DIM, " / 17%")) -- 17% = spell-hit cap vs lvl-73
end

-- The upload workflow shown on the Export tab (also restored after a /tgs debug view). No copy box —
-- the full export is too large for a WoW EditBox, so the website ingests the SavedVariables .lua file.
local EXPORT_STEPS =
  "To load your gear into the website:\n\n" ..
  color(GOLD, "1.") .. "  Type " .. color(CYAN, "/reload") .. "   (writes the export to disk)\n\n" ..
  color(GOLD, "2.") .. "  On the website, open " .. color(CYAN, "Use your own gear") .. " and click\n" ..
  "      " .. color(CYAN, "Upload SavedVariables (.lua)") .. "\n\n" ..
  color(GOLD, "3.") .. "  Pick this file:\n" ..
  "      " .. color(DIM, "World of Warcraft\\_anniversary_\\WTF\\Account\\") .. "\n" ..
  "      " .. color(DIM, "<your account>\\SavedVariables\\TankadinGearSim.lua")

-- Run the export (writes SavedVariables) and show the upload instructions.
local function refreshExport()
  exportSteps:SetText(EXPORT_STEPS)
  if not Exporter or not Exporter.run then
    exportInfo:SetText(color(BAD, "Exporter not loaded (ns.Exporter missing) — check for a Lua error on login."))
    return
  end
  local ok, text, count = pcall(Exporter.run)
  if not ok then
    exportInfo:SetText(color(BAD, "Export failed: " .. tostring(text)))
    return
  end
  exportInfo:SetText(color(GOOD, string.format("Exported %d items + character.", count or 0)) ..
    color(DIM, "  Open your bank first for banked gear."))
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
  -- Passing trinketLocks (even empty) overrides the engine's hardcoded default. On -> force the player's
  -- two equipped trinkets in (icon = kept in every set; eye = every set but Survival). Off -> {} = free pick.
  local trinketLocks = {}
  if UI.lockTrinkets then
    local eq = {}
    for _, it in ipairs(items) do
      if it.slot == "trinket" and it.equipped then eq[#eq + 1] = it.itemId end
    end
    trinketLocks.icon, trinketLocks.eye = eq[1], eq[2]
  end
  optStatus:SetText(color(DIM, string.format("%d items · %s · %s · solving...",
    #items, profTxt, faction or "both factions")))

  optButton:SetEnabled(false)
  -- Keep EVERY item's gems/enchants exactly as they are (never re-gem or fill an empty socket), so the
  -- addon's numbers match what you'll have on equip. Expressed as "keep all these item ids, ignoring
  -- completeness" — the engine has no plain "keep everything as-is" flag, but all-ids does it. Re-gem /
  -- phase / goal-slider options live on the full sim site (footer link).
  local keepAll = {}
  for _, it in ipairs(items) do keepAll[#keepAll + 1] = it.itemId end
  -- "Optimize with Kings + MotW" toggle: raid buffs assumed (default) vs unbuffed gear-only sets.
  local buff = UI.optBuffs and "raid" or "none"
  -- Build the four goals from the tuning sliders: clone each preset, override its EHP:Threat ratio from
  -- the slider and set the site-matching Min-HP floor. (No slider -> preset defaults, which now match
  -- the site.) The engine blends ratio via Scoring.blendScale and treats minHealth as a hard floor.
  local goals = {}
  local presets = ns.engine.Runner.GOAL_PRESETS
  for _, id in ipairs(SLIDER_GOALS) do
    local preset
    for _, g in ipairs(presets) do if g.id == id then preset = g; break end end
    if preset then
      local v = UI.goalV[id] or 0
      local gates = {}
      if preset.gates then for k, val in pairs(preset.gates) do gates[k] = val end end
      gates.minHealth = UI.goalMinHP[id]
      goals[#goals + 1] = { id = id, name = preset.name, focus = ratioText(id, v),
        ratio = ratioFor(id, v), gates = gates, lockEye = preset.lockEye }
    end
  end
  optRun = ns.Async.optimizeSets(items,
    { buff = buff, professions = professions, faction = faction, trinketLocks = trinketLocks,
      goals = goals, keepGemsEnchants = { itemIds = keepAll, ignoreCompleteness = true } },
    function(results) -- onDone
      optButton:SetEnabled(true)
      renderOptimize(results)
      if ns.Minimap and ns.Minimap.SetSets then ns.Minimap.SetSets(results) end -- feed the minimap flyout
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
  -- Each tab has a MINIMUM size (so its text can't be squeezed into overlap); the user's dragged size
  -- (TankadinGearSimUI) is reused across tabs, clamped up to the current tab's minimum. SetMinResize
  -- keeps the grip from dragging below it.
  local mn = TAB_MIN[key] or TAB_MIN.live
  if frame.SetResizeBounds then frame:SetResizeBounds(mn[1], mn[2])
  elseif frame.SetMinResize then frame:SetMinResize(mn[1], mn[2]) end
  TankadinGearSimUI = TankadinGearSimUI or {}
  frame:SetSize(math.max(TankadinGearSimUI.w or 0, mn[1]), math.max(TankadinGearSimUI.h or 0, mn[2]))
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

-- /tgs debug — Core.debug() also prints to chat; show the same lines on the Export pane (small enough
-- to render, unlike the full export). Click the Export tab to restore the upload instructions.
function UI.ShowDebug(text)
  if not frame then buildFrame() end
  frame:Show()
  frame:SetSize(470, 320)
  for k, p in pairs(panes) do
    p:SetShown(k == "export")
    tabs[k]:SetEnabled(k ~= "export")
  end
  exportInfo:SetText("/tgs debug — also printed to chat.")
  exportSteps:SetText(text or "")
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

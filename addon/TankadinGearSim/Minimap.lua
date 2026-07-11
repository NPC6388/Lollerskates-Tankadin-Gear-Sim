-- Minimap button for the optimizer's sets — ItemRack-style. Left-click opens a flyout of the sets the
-- Optimize tab last produced; mousing over a set shows its full per-slot contents; clicking a set
-- equips it (best-effort — items must be in your bags, and not in combat). The sets are stashed in
-- SavedVariables (TankadinGearSimUI.sets) by UI.Optimize, so the button works across /reloads.
local ADDON, ns = ...
ns.Minimap = ns.Minimap or {}
local M = ns.Minimap

local GOLD, CYAN, DIM, GOOD, BAD = "|cffd9b870", "|cff5fd0e6", "|cff9aa0a6", "|cff7ee787", "|cffff6b6b"
-- Legal/illegal marks: built-in ready-check textures (render reliably, unlike a font glyph).
local TICK  = "|TInterface\\RaidFrame\\ReadyCheck-Ready:0|t"
local CROSS = "|TInterface\\RaidFrame\\ReadyCheck-NotReady:0|t"

-- Thematic icon per set (built-in TBC spell/ability icons). Options if you want to swap:
--   raid:     Spell_Holy_RighteousFury (threat aura) · Ability_ThunderClap · Spell_Holy_Excorcism_02 · INV_Sword_27
--   survival: Spell_Holy_DevotionAura (armor aura)   · Spell_Holy_BlessingOfProtection · INV_Shield_06 · Ability_Defend
--   aoe:      Ability_Warrior_Cleave (multi-target)  · Spell_Fire_SelfDestruct · Spell_Holy_Excorcism_02
--   balanced: Spell_Holy_SealOfJustice (scales)      · Ability_Paladin_ArtOfWar · INV_Misc_Gem_Diamond_01
local SET_ICON = {
  raid     = "Interface\\Icons\\Spell_Holy_RighteousFury",
  survival = "Interface\\Icons\\Spell_Holy_DevotionAura",
  aoe      = "Interface\\Icons\\Ability_Warrior_Cleave",
  balanced = "Interface\\Icons\\Spell_Holy_SealOfJustice",
}
local SET_ICON_FALLBACK = "Interface\\Icons\\INV_Misc_QuestionMark"

-- Our slot names -> WoW inventory slot ids (for equipping). Ordered for the tooltip readout.
local SLOT_ORDER = { "head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs",
  "feet", "ring1", "ring2", "trinket1", "trinket2", "weapon", "offhand", "relic" }
local SLOT_LABEL = { head = "Head", neck = "Neck", shoulder = "Shoulder", back = "Cloak", chest = "Chest",
  wrist = "Wrist", hands = "Hands", waist = "Waist", legs = "Legs", feet = "Feet", ring1 = "Ring 1",
  ring2 = "Ring 2", trinket1 = "Trinket 1", trinket2 = "Trinket 2", weapon = "Main Hand",
  offhand = "Off Hand", relic = "Relic" }
local SLOT_INV = { head = 1, neck = 2, shoulder = 3, back = 15, chest = 5, waist = 6, legs = 7, feet = 8,
  wrist = 9, hands = 10, ring1 = 11, ring2 = 12, trinket1 = 13, trinket2 = 14, weapon = 16, offhand = 17,
  relic = 18 }

local sets = {}   -- [{ name, id, slots = { slot = { id, name } } }, ...]
local button, flyout

-- Container API (namespaced on newer clients, global on 2.5.4) — for pulling banked items into bags.
local CC = _G.C_Container
local GetContainerNumSlots = (CC and CC.GetContainerNumSlots) or _G.GetContainerNumSlots
local GetContainerItemID   = (CC and CC.GetContainerItemID) or _G.GetContainerItemID
local PickupContainerItem  = (CC and CC.PickupContainerItem) or _G.PickupContainerItem
local BAGS  = { 0, 1, 2, 3, 4 }                 -- backpack + equipped bags
local BANKS = { -1, 5, 6, 7, 8, 9, 10, 11 }     -- bank main + bank bag slots (only readable while the bank is open)

local function scanFor(containers, id)
  for _, bag in ipairs(containers) do
    local n = GetContainerNumSlots and GetContainerNumSlots(bag) or 0
    for slot = 1, n do
      if GetContainerItemID(bag, slot) == id then return bag, slot end
    end
  end
end

local function freeBagSlots()
  local out = {}
  for _, bag in ipairs(BAGS) do
    local n = GetContainerNumSlots and GetContainerNumSlots(bag) or 0
    for slot = 1, n do
      if not GetContainerItemID(bag, slot) then out[#out + 1] = { bag, slot } end
    end
  end
  return out
end

-- ---- store the optimizer's results (called from UI.Optimize onDone) ----
function M.SetSets(results)
  sets = {}
  for _, r in ipairs(results or {}) do
    if r and r.goal then
      local slots = {}
      for slot, it in pairs(r.selection or {}) do
        if it then slots[slot] = { id = it.itemId, name = it.name } end
      end
      sets[#sets + 1] = { name = r.goal.name, id = r.goal.id, legal = r.legal and true or false, slots = slots }
    end
  end
  TankadinGearSimUI = TankadinGearSimUI or {}
  TankadinGearSimUI.sets = sets
  if flyout and flyout:IsShown() then M.BuildFlyout() end
end

-- ---- equip a set ----
-- EquipItemByName only sees your BAGS (not the bank), so for any piece that's sitting in the bank we
-- first pull it into a free bag slot (requires the bank window to be open), wait a tick for the moves
-- to settle, then equip everything.
local function equipSet(set)
  if InCombatLockdown() then
    UIErrorsFrame:AddMessage("TGS: can't swap gear in combat.", 1, 0.3, 0.3)
    return
  end
  local bankOpen = BankFrame and BankFrame:IsShown()
  local free, fi, pulled, stuck = freeBagSlots(), 1, 0, 0
  local pending = {}
  for _, slot in ipairs(SLOT_ORDER) do
    local inv, item = SLOT_INV[slot], set.slots[slot]
    if inv and item and item.id then
      if not scanFor(BAGS, item.id) then          -- not in bags (worn already, or banked)
        local bbag, bslot = scanFor(BANKS, item.id) -- only finds it when the bank is open
        if bbag then
          if free[fi] then
            ClearCursor(); PickupContainerItem(bbag, bslot)
            PickupContainerItem(free[fi][1], free[fi][2]); ClearCursor()
            fi, pulled = fi + 1, pulled + 1
          else
            stuck = stuck + 1                       -- in the bank but no free bag slot
          end
        end
      end
      pending[#pending + 1] = { item.id, inv }
    end
  end
  local function doEquip()
    for _, e in ipairs(pending) do pcall(EquipItemByName, e[1], e[2]) end
    local msg = GOOD .. "TGS|r equipped " .. GOLD .. (set.name or "?") .. "|r"
    if pulled > 0 then msg = msg .. DIM .. " (pulled " .. pulled .. " from the bank)|r" end
    if stuck > 0 then msg = msg .. BAD .. " (" .. stuck .. " couldn't fit — free up bag space)|r"
    elseif not bankOpen then msg = msg .. DIM .. " — open your bank to pull any banked pieces|r" end
    DEFAULT_CHAT_FRAME:AddMessage(msg)
  end
  if pulled > 0 then C_Timer.After(0.3, doEquip) else doEquip() end
end

-- ---- tooltip: the set's per-slot contents ----
local function showSetTooltip(owner, set)
  GameTooltip:SetOwner(owner, "ANCHOR_LEFT")
  GameTooltip:AddLine(set.name .. (set.legal and "" or "  " .. BAD .. "(gates not met)|r"), 1, 0.85, 0.44)
  for _, slot in ipairs(SLOT_ORDER) do
    local it = set.slots[slot]
    if it then GameTooltip:AddDoubleLine(DIM .. SLOT_LABEL[slot] .. "|r", it.name or ("item:" .. tostring(it.id)), 1, 1, 1, 0.9, 0.9, 0.9) end
  end
  GameTooltip:AddLine(" ")
  GameTooltip:AddLine(CYAN .. "Click|r to equip this set.", 0.6, 0.8, 1)
  GameTooltip:Show()
end

-- ---- flyout: one row per set ----
local function getRow(i)
  local row = flyout.rows[i]
  if not row then
    row = CreateFrame("Button", nil, flyout)
    row:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
    row.icon = row:CreateTexture(nil, "ARTWORK")
    row.icon:SetSize(16, 16); row.icon:SetPoint("LEFT", 6, 0)
    row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92) -- trim the default icon border
    row.text = row:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    row.text:SetPoint("LEFT", row.icon, "RIGHT", 5, 0); row.text:SetJustifyH("LEFT")
    flyout.rows[i] = row
  end
  return row
end

function M.BuildFlyout()
  if not flyout then
    flyout = CreateFrame("Frame", "TGSMinimapFlyout", UIParent, "BackdropTemplate")
    flyout:SetFrameStrata("DIALOG")
    flyout:EnableMouse(true)
    flyout:Hide()
    local bg = flyout:CreateTexture(nil, "BACKGROUND"); bg:SetAllPoints(); bg:SetColorTexture(0, 0, 0, 0.92)
    flyout.rows = {}
    flyout.title = flyout:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    flyout.title:SetPoint("TOPLEFT", 10, -8)
  end
  for _, row in ipairs(flyout.rows) do row:Hide() end
  flyout.title:SetText(GOLD .. "Optimized sets|r")

  local width, y = 210, -26
  if #sets == 0 then
    local row = getRow(1)
    row:ClearAllPoints(); row:SetSize(width - 12, 18); row:SetPoint("TOPLEFT", 6, y)
    row.icon:Hide()
    row.text:SetText(DIM .. "No sets yet — run /tgs \226\134\146 Optimize.|r")
    row:SetScript("OnEnter", nil); row:SetScript("OnLeave", nil); row:SetScript("OnClick", nil)
    row:Show(); y = y - 20
  else
    for i, set in ipairs(sets) do
      local row = getRow(i)
      row:ClearAllPoints(); row:SetSize(width - 12, 20); row:SetPoint("TOPLEFT", 6, y)
      row.icon:SetTexture(SET_ICON[set.id] or SET_ICON_FALLBACK); row.icon:Show()
      row.text:SetText((set.legal and TICK or CROSS) .. " " .. set.name)
      row:SetScript("OnEnter", function(self) showSetTooltip(self, set) end)
      row:SetScript("OnLeave", function() GameTooltip:Hide() end)
      row:SetScript("OnClick", function() equipSet(set); flyout:Hide() end)
      row:Show(); y = y - 20
    end
  end
  flyout:SetSize(width, -y + 8)
end

-- ---- the minimap button ----
local function updatePosition(angle)
  TankadinGearSimUI = TankadinGearSimUI or {}
  TankadinGearSimUI.minimapAngle = angle
  local a = math.rad(angle)
  button:SetPoint("CENTER", Minimap, "CENTER", 80 * math.cos(a), 80 * math.sin(a))
end

local function onDrag(self)
  local mx, my = Minimap:GetCenter()
  local px, py = GetCursorPosition()
  local scale = Minimap:GetEffectiveScale()
  px, py = px / scale, py / scale
  updatePosition(math.deg(math.atan2(py - my, px - mx)))
end

function M.Toggle()
  M.BuildFlyout()
  if flyout:IsShown() then flyout:Hide(); return end
  flyout:ClearAllPoints()
  flyout:SetPoint("TOPRIGHT", button, "BOTTOMLEFT", 0, 0)
  flyout:Show()
end

local function buildButton()
  if button then return end
  button = CreateFrame("Button", "TGSMinimapButton", Minimap)
  button:SetFrameStrata("MEDIUM"); button:SetFrameLevel(8)
  button:SetSize(31, 31)
  button:RegisterForClicks("LeftButtonUp", "RightButtonUp")

  local icon = button:CreateTexture(nil, "BACKGROUND")
  icon:SetTexture("Interface\\Icons\\INV_Shield_06")
  icon:SetSize(20, 20); icon:SetPoint("CENTER", 0, 1); icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  local overlay = button:CreateTexture(nil, "OVERLAY")
  overlay:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  overlay:SetSize(53, 53); overlay:SetPoint("TOPLEFT")

  button:SetMovable(true); button:RegisterForDrag("LeftButton")
  button:SetScript("OnDragStart", function(self) self:SetScript("OnUpdate", onDrag) end)
  button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
  button:SetScript("OnClick", function(self, btn)
    if btn == "RightButton" then
      if ns.UI and ns.UI.Show then ns.UI.Show("optimize") end
    else
      M.Toggle()
    end
  end)
  button:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine("Tankadin Gear Sim")
    GameTooltip:AddLine(CYAN .. "Left-click|r  optimized sets", 1, 1, 1)
    GameTooltip:AddLine(CYAN .. "Right-click|r  open the Optimize tab", 1, 1, 1)
    GameTooltip:AddLine(CYAN .. "Drag|r  move around the minimap", 1, 1, 1)
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", function() GameTooltip:Hide() end)

  updatePosition((TankadinGearSimUI and TankadinGearSimUI.minimapAngle) or 200)
end

-- Restore saved sets + build the button once SavedVariables are available.
local loader = CreateFrame("Frame")
loader:RegisterEvent("PLAYER_LOGIN")
loader:SetScript("OnEvent", function()
  TankadinGearSimUI = TankadinGearSimUI or {}
  sets = TankadinGearSimUI.sets or {}
  buildButton()
end)

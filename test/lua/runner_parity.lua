-- Lua-side parity check for the ported four-set orchestration (Phase D5b).
-- Loads the full ported engine + Runner with an injected addon namespace, then asserts
-- Runner.optimizeSets reproduces the JS optimizeSets golden summaries in test/lua/runner_fixtures.lua
-- (selection / agg / evald / gemChoices / metas / per-slot detail incl. alternatives / buffImpact).
--
-- Run from the repo root with any Lua 5.1+ interpreter:  lua test/lua/runner_parity.lua
-- (Regenerate goldens: npm run gen-runner-fixtures.)

local ENGINE = "addon/TankadinGearSim/engine/"
local EPS = 1e-6

local ns = { engine = {} }
local function loadEngine(file) return assert(loadfile(ENGINE .. file))("TankadinGearSim", ns) end
for _, f in ipairs({
  "Constants.lua", "Combat.lua", "Evaluate.lua", "Weights.lua", "Scoring.lua",
  "CharacterData.lua", "Model.lua", "GemsData.lua", "Gems.lua", "EnchantsData.lua", "Enchants.lua",
  "ProfessionsData.lua", "Professions.lua", "LibramsData.lua", "Librams.lua",
  "ScrollsData.lua", "Scrolls.lua", "GemSolver.lua", "SetsData.lua", "Sets.lua", "Optimizer.lua", "Runner.lua",
}) do loadEngine(f) end
local Runner = ns.engine.Runner

local fx = assert(loadfile("test/lua/runner_fixtures.lua"))()

local failures = 0
local function almostEq(a, b) return math.abs(a - b) <= EPS end
local function deq(a, b, path)
  if type(a) ~= type(b) then return false, path .. " (type " .. type(a) .. "/" .. type(b) .. ")" end
  if type(a) ~= "table" then
    if type(a) == "number" then
      if not almostEq(a, b) then return false, path .. " (" .. tostring(a) .. "/" .. tostring(b) .. ")" end
      return true
    end
    if a ~= b then return false, path .. " (" .. tostring(a) .. "/" .. tostring(b) .. ")" end
    return true
  end
  for k, v in pairs(a) do
    local ok, p = deq(v, b[k], path .. "." .. tostring(k))
    if not ok then return false, p end
  end
  for k in pairs(b) do if a[k] == nil then return false, path .. "." .. tostring(k) .. " (missing in got)" end end
  return true
end

local function pair(c) return { name = c.name, socket = c.socket } end
local function summarize(r)
  local s = { id = r.goal.id, legal = r.legal }
  if r.hpBestEffort then s.hpBestEffort = true end
  s.selection = {}
  for slot, i in pairs(r.selection) do if i then s.selection[slot] = i.itemId end end
  local A, E = r.agg, r.evald
  s.agg = {
    spellPower = A.spellPower, spellPowerLiteral = A.spellPowerLiteral, spellPowerEquiv = A.spellPowerEquiv,
    health = A.health, armor = A.armor, stamina = A.stamina, agility = A.agility, strength = A.strength,
    intellect = A.intellect, blockValue = A.blockValue, spellCritRating = A.spellCritRating,
  }
  s.evald = {
    totalAvoidanceWithHS = E.totalAvoidanceWithHS, critReduction = E.critReduction, ehpPhysical = E.ehpPhysical,
    uncrushable = E.uncrushable, raidCritImmune = E.raidCritImmune,
  }
  s.gemChoices = {}
  for _, c in ipairs(r.gemChoices) do s.gemChoices[#s.gemChoices + 1] = pair(c) end
  s.metas = {}
  for _, m in ipairs(r.metas) do s.metas[#s.metas + 1] = { name = m.name, active = m.active } end
  s.perSlot = {}
  for slot, p in pairs(r.perSlot) do
    local gems = {}
    for _, g in ipairs(p.gems or {}) do gems[#gems + 1] = pair(g) end
    local alts = {}
    for _, a in ipairs(p.alternatives or {}) do
      alts[#alts + 1] = { itemId = a.itemId, objDelta = a.objDelta, dropInLegal = a.dropInLegal, bonusKept = a.bonusKept }
    end
    s.perSlot[slot] = {
      gems = gems,
      enchant = p.enchant and p.enchant.name or nil,
      defGemmed = p.defGemmed, locked = p.locked, bonusKept = p.bonusKept,
      socketBonus = p.socketBonus and { stat = p.socketBonus.stat, value = p.socketBonus.value } or nil,
      alternatives = alts,
    }
  end
  if r.buffImpact then
    local b = r.buffImpact
    s.buffImpact = {
      stamina = b.stamina, agility = b.agility, intellect = b.intellect, strength = b.strength,
      armor = b.armor, health = b.health, crushAvoid = b.crushAvoid, critReduction = b.critReduction,
    }
  end
  return s
end

local checks = 0
for ci, case in ipairs(fx.cases) do
  local results = Runner.optimizeSets(fx.items, case.options)
  if #results ~= #case.results then
    failures = failures + 1
    print(string.format("FAIL  case %d: got %d goals, want %d", ci, #results, #case.results))
  else
    for gi, want in ipairs(case.results) do
      checks = checks + 1
      local got = summarize(results[gi])
      local ok, path = deq(got, want, string.format("case%d.%s", ci, want.id))
      if not ok then
        failures = failures + 1
        print("FAIL  " .. path)
      end
    end
  end
end

if failures == 0 then
  print(string.format("PASS  runner parity: %d goal results matched within %g", checks, EPS))
  os.exit(0)
else
  print(string.format("FAILED  %d runner checks", failures))
  os.exit(1)
end

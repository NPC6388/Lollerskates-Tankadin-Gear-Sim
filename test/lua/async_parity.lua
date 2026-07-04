-- Async-yield soundness check for the frame-yielding search (Phase D5c).
-- The AsyncSearch driver needs WoW APIs (CreateFrame/OnUpdate/debugprofilestop) so it can't run here, but
-- the CLAIM that matters IS testable without them: driving Runner.optimizeSets inside a coroutine that
-- yields via the engine's ns.engine.onTick hook must produce a result IDENTICAL to the synchronous run.
-- This resumes the coroutine yielding on EVERY tick (maximal suspend/resume churn) and compares the two.
--
-- Run from the repo root:  lua test/lua/async_parity.lua

local ENGINE = "addon/TankadinGearSim/engine/"

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

-- Compact signature of a results array: per goal { id, legal, selection, spell power, health }.
local function sig(results)
  local out = {}
  for i, r in ipairs(results) do
    local sel = {}
    for slot, it in pairs(r.selection) do if it then sel[slot] = it.itemId end end
    out[i] = { id = r.goal.id, legal = r.legal, sel = sel,
      sp = math.floor((r.agg.spellPower or 0) * 1000 + 0.5),
      hp = math.floor((r.agg.health or 0) * 1000 + 0.5) }
  end
  return out
end

local function eq(a, b, path)
  if type(a) ~= type(b) then return false, path end
  if type(a) ~= "table" then if a ~= b then return false, path end return true end
  for k, v in pairs(a) do local ok, p = eq(v, b[k], path .. "." .. tostring(k)); if not ok then return false, p end end
  for k in pairs(b) do if a[k] == nil then return false, path .. "." .. tostring(k) end end
  return true
end

-- Drive Runner.optimizeSets inside a coroutine, yielding on every tick; resume until it finishes.
local function runAsync(items, options)
  local co = coroutine.create(function() return Runner.optimizeSets(items, options) end)
  ns.engine.onTick = function() coroutine.yield() end
  local result, guard = nil, 0
  while true do
    guard = guard + 1
    assert(guard < 5000000, "async run did not terminate")
    local ok, res = coroutine.resume(co)
    if not ok then ns.engine.onTick = nil; error("coroutine error: " .. tostring(res)) end
    if coroutine.status(co) == "dead" then result = res; break end
  end
  ns.engine.onTick = nil
  return result
end

local failures, checks = 0, 0
for ci, case in ipairs(fx.cases) do
  local syncSig = sig(Runner.optimizeSets(fx.items, case.options)) -- onTick is nil here (sync)
  local asyncSig = sig(runAsync(fx.items, case.options))
  checks = checks + 1
  local ok, path = eq(asyncSig, syncSig, "case" .. ci)
  if not ok then failures = failures + 1; print("FAIL  " .. path .. " (async != sync)") end
end

if failures == 0 then
  print(string.format("PASS  async parity: %d option sets — coroutine yield == sync result", checks))
  os.exit(0)
else
  print(string.format("FAILED  %d async checks", failures))
  os.exit(1)
end

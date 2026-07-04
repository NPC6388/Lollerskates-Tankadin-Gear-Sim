-- Lua-side parity check for the ported optimizer core (Phase D5a).
-- Loads the ported Optimizer + Sets (and the Model/Evaluate/Scoring/Weights deps) with an injected
-- addon namespace, then asserts buildPool / distinctOk / optimizeHeuristic / optimizeExhaustive
-- reproduce the JS goldens in test/lua/optimizer_fixtures.lua (same selection / objective / legality).
--
-- Run from the repo root with any Lua 5.1+ interpreter:  lua test/lua/optimizer_parity.lua
-- (Regenerate goldens: npm run gen-optimizer-fixtures; regenerate SetsData: npm run gen-lua.)

local ENGINE = "addon/TankadinGearSim/engine/"
local EPS = 1e-6

local ns = { engine = {} }
local function loadEngine(file) return assert(loadfile(ENGINE .. file))("TankadinGearSim", ns) end
for _, f in ipairs({
  "Constants.lua", "Combat.lua", "Evaluate.lua", "Weights.lua", "Scoring.lua",
  "CharacterData.lua", "Model.lua", "SetsData.lua", "Sets.lua", "Optimizer.lua",
}) do loadEngine(f) end
local Optimizer = ns.engine.Optimizer

local fx = assert(loadfile("test/lua/optimizer_fixtures.lua"))()
local byId = {}
for _, it in ipairs(fx.items) do byId[it.itemId] = it end

local failures, checks = 0, 0
local function fail(label, detail)
  failures = failures + 1
  print(string.format("FAIL  %s%s", label, detail and ("  " .. detail) or ""))
end
local function checkEq(label, got, want)
  checks = checks + 1
  if got ~= want then fail(label, string.format("got=%s want=%s", tostring(got), tostring(want))) end
end
local function checkNum(label, got, want)
  checks = checks + 1
  if type(got) ~= "number" or math.abs(got - want) > EPS then
    fail(label, string.format("got=%s want=%s", tostring(got), tostring(want)))
  end
end
local function checkSeq(label, got, want) -- ordered array of scalars
  checks = checks + 1
  local ok = (#got == #want)
  if ok then for i = 1, #want do if got[i] ~= want[i] then ok = false; break end end end
  if not ok then fail(label, "sequence mismatch") end
end
-- Compare a slot->itemId map (want) against a slot->item selection (gotSel) or false.
local function checkSelIds(label, gotSel, want)
  checks = checks + 1
  if want == false then
    if gotSel ~= nil then fail(label, "expected nil result") end
    return
  end
  if gotSel == nil then fail(label, "got nil result"); return end
  local ok = true
  for slot, id in pairs(want) do if not gotSel[slot] or gotSel[slot].itemId ~= id then ok = false; break end end
  if ok then for slot, it in pairs(gotSel) do if it and want[slot] == nil then ok = false; break end end end
  if not ok then fail(label, "selection mismatch") end
end

-- 1. buildPool
for i, c in ipairs(fx.buildPool) do
  local bp = Optimizer.buildPool(fx.items, { lock = c.lock, exclude2H = c.exclude2H })
  checkSeq("buildPool[" .. i .. "].order", bp.order, c.order)
  checks = checks + 1
  local dok = (#bp.distinct == #c.distinct)
  if dok then for j = 1, #c.distinct do
    if bp.distinct[j][1] ~= c.distinct[j][1] or bp.distinct[j][2] ~= c.distinct[j][2] then dok = false; break end
  end end
  if not dok then fail("buildPool[" .. i .. "].distinct", "distinct mismatch") end
  checks = checks + 1
  local lok = true
  for slot, id in pairs(c.locked) do if not bp.locked[slot] or bp.locked[slot].itemId ~= id then lok = false; break end end
  if lok then for slot in pairs(bp.locked) do if c.locked[slot] == nil then lok = false; break end end end
  if not lok then fail("buildPool[" .. i .. "].locked", "locked mismatch") end
  checks = checks + 1
  local sok = true
  for slot, n in pairs(c.sizes) do if not bp.pool[slot] or #bp.pool[slot] ~= n then sok = false; break end end
  if not sok then fail("buildPool[" .. i .. "].sizes", "pool-size mismatch") end
end

-- 2. distinctOk
for i, c in ipairs(fx.distinctOk) do
  local sel = {}
  for slot, id in pairs(c.sel) do sel[slot] = byId[id] end
  checkEq("distinctOk[" .. i .. "]", Optimizer.distinctOk(sel, c.distinct), c.expect)
end

-- 3. optimizeHeuristic
for i, c in ipairs(fx.heuristic) do
  local bp = Optimizer.buildPool(fx.items, { lock = c.lock })
  local r = Optimizer.optimizeHeuristic(bp.pool, bp.order, fx.goals[c.goal],
    { distinct = bp.distinct, locked = bp.locked, seed = c.seed })
  checkSelIds("heuristic[" .. i .. "] " .. c.goal .. ".sel", r.selection, c.selIds)
  checkNum("heuristic[" .. i .. "] " .. c.goal .. ".obj", r.objectiveValue, c.objectiveValue)
  checkEq("heuristic[" .. i .. "] " .. c.goal .. ".legal", r.legal, c.legal)
end

-- 4. optimizeExhaustive
for i, c in ipairs(fx.exhaustive) do
  local bp = Optimizer.buildPool(fx.items, { lock = c.lock })
  local r = Optimizer.optimizeExhaustive(bp.pool, bp.order, fx.goals[c.goal], { distinct = bp.distinct })
  checkSelIds("exhaustive[" .. i .. "] " .. c.goal .. ".sel", r and r.selection, c.selIds)
  if c.selIds ~= false then
    checkNum("exhaustive[" .. i .. "] " .. c.goal .. ".obj", r.objectiveValue, c.objectiveValue)
    checkEq("exhaustive[" .. i .. "] " .. c.goal .. ".legal", r.legal, c.legal)
  end
end

if failures == 0 then
  print(string.format("PASS  optimizer parity: %d checks matched within %g", checks, EPS))
  os.exit(0)
else
  print(string.format("FAILED  %d/%d optimizer checks", failures, checks))
  os.exit(1)
end

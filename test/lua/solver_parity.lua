-- Lua-side parity check for the ported gem/enchant solver (Phase D4).
-- Loads the generated solver data + hand-ported logic (Gems/Enchants/Professions/Librams/Scrolls/
-- GemSolver, plus the Scoring/Model/Evaluate deps) with an injected addon namespace, then asserts the
-- ported functions reproduce the JS goldens in test/lua/solver_fixtures.lua.
--
-- Run from the repo root with any Lua 5.1+ interpreter:
--     lua test/lua/solver_parity.lua
-- (Regenerate goldens with `npm run gen-solver-fixtures`; regenerate the data with `npm run gen-lua`.)

local ENGINE = "addon/TankadinGearSim/engine/"
local EPS = 1e-9

local ns = { engine = {} }
local function loadEngine(file)
  local chunk = assert(loadfile(ENGINE .. file))
  return chunk("TankadinGearSim", ns)
end
-- Dependency order (data before logic; GemSolver needs Model/Evaluate/Scoring/CharacterData).
for _, f in ipairs({
  "Constants.lua", "Combat.lua", "Evaluate.lua", "Weights.lua", "Scoring.lua",
  "CharacterData.lua", "Model.lua",
  "GemsData.lua", "Gems.lua", "EnchantsData.lua", "Enchants.lua",
  "ProfessionsData.lua", "Professions.lua", "LibramsData.lua", "Librams.lua",
  "ScrollsData.lua", "Scrolls.lua", "GemSolver.lua",
}) do loadEngine(f) end

local Gems, Enchants = ns.engine.Gems, ns.engine.Enchants
local Professions, Librams, Scrolls = ns.engine.Professions, ns.engine.Librams, ns.engine.Scrolls
local GemSolver = ns.engine.GemSolver

local fx = assert(loadfile("test/lua/solver_fixtures.lua"))()
local WEIGHTS = fx.weights

local failures, checks = 0, 0
local function fail(label, detail)
  failures = failures + 1
  print(string.format("FAIL  %s%s", label, detail and ("  " .. detail) or ""))
end

local function deepEqual(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= "table" then
    if type(a) == "number" then return math.abs(a - b) <= EPS end
    return a == b
  end
  for k, v in pairs(a) do if not deepEqual(v, b[k]) then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end

local function checkEq(label, got, want)
  checks = checks + 1
  if got ~= want then fail(label, string.format("got=%s want=%s", tostring(got), tostring(want))) end
end
local function checkDeep(label, got, want)
  checks = checks + 1
  if not deepEqual(got, want) then fail(label, "table mismatch") end
end
-- A gem/enchant pick result: false (nil expected) or { name, score }.
local function checkPick(label, got, want, key)
  checks = checks + 1
  if want == false then
    if got ~= nil then fail(label, "expected nil pick") end
  elseif got == nil then
    fail(label, "got nil, wanted " .. tostring(want.name))
  elseif got[key].name ~= want.name or math.abs(got.score - want.score) > EPS then
    fail(label, string.format("got=%s/%s want=%s/%s", tostring(got[key].name), tostring(got.score), want.name, want.score))
  end
end
local function checkChoices(label, got, want)
  checks = checks + 1
  local ok = (#got == #want)
  if ok then
    for i = 1, #want do
      if got[i].socket ~= want[i].socket or got[i].name ~= want[i].name then ok = false; break end
    end
  end
  if not ok then fail(label, "choices mismatch") end
end
local function checkNameMap(label, got, want) -- got: slot->pick obj; want: slot->name
  checks = checks + 1
  local ok = true
  for slot, name in pairs(want) do if not got[slot] or got[slot].name ~= name then ok = false; break end end
  if ok then for slot in pairs(got) do if want[slot] == nil then ok = false; break end end end
  if not ok then fail(label, "enchant-choice map mismatch") end
end

-- 1. bestGem
for i, c in ipairs(fx.bestGem) do
  checkPick("bestGem[" .. i .. "] " .. c.w, Gems.bestGem(WEIGHTS[c.w], c.opts), c.result, "gem")
end
-- 2. bestMeta
for i, c in ipairs(fx.bestMeta) do
  checkPick("bestMeta[" .. i .. "] " .. c.w, Gems.bestMeta(WEIGHTS[c.w], c.opts), c.result, "gem")
end
-- 3. metaConditionHolds
for i, c in ipairs(fx.metaCond) do
  checkEq("metaCond[" .. i .. "] " .. c.cond, Gems.metaConditionHolds(c.cond, c.counts), c.expect)
end
-- 4. metaActivated
for i, c in ipairs(fx.metaActivated) do
  checkEq("metaActivated[" .. i .. "]", Gems.metaActivated({ requires = c.requires }, c.counts), c.expect)
end
-- 5. bestEnchant
for i, c in ipairs(fx.bestEnchant) do
  checkPick("bestEnchant[" .. i .. "] " .. c.slot, Enchants.bestEnchant(c.slot, WEIGHTS[c.w], c.perks, c.opts), c.result, "enchant")
end
-- 6. factionFromEnchant
for i, c in ipairs(fx.faction) do
  checkEq("faction[" .. i .. "]", Enchants.factionFromEnchant(c.enchantId), c.expect)
end
-- 7. detectFaction
for i, c in ipairs(fx.detect) do
  checkEq("detect[" .. i .. "]", Enchants.detectFaction(c.items), c.expect)
end
-- 8. professionPerks
for i, c in ipairs(fx.professions) do
  checkDeep("professions[" .. i .. "]", Professions.professionPerks(c.chosen), c.expect)
end
-- 9. libramStats
for i, c in ipairs(fx.librams) do
  local got = Librams.libramStats(c.item)
  if c.expect == false then checkEq("librams[" .. i .. "]", got, nil)
  else checkDeep("librams[" .. i .. "]", got, c.expect) end
end
-- 10. scrollStats
for i, c in ipairs(fx.scrolls) do
  checkDeep("scrolls[" .. i .. "]", Scrolls.scrollStats(c.keys), c.expect)
end
-- 11. reassignForBonus / bonusEarnedAsTagged
for i, c in ipairs(fx.reassign) do
  local clone = {}
  for j, ch in ipairs(c.choices) do clone[j] = { color = ch.color, socket = ch.socket } end
  local ret = GemSolver.reassignForBonus(clone, c.sockets)
  checkEq("reassign[" .. i .. "].ret", ret, c.ret)
  checks = checks + 1
  local ok = true
  for j = 1, #c.resultSockets do if clone[j].socket ~= c.resultSockets[j] then ok = false; break end end
  if not ok then fail("reassign[" .. i .. "].sockets", "socket relabel mismatch") end
  checkEq("reassign[" .. i .. "].earned", GemSolver.bonusEarnedAsTagged(clone), c.earned)
end
-- 12. recommendGems
for i, c in ipairs(fx.recommendGems) do
  local r = GemSolver.recommendGems(c.socketCounts, WEIGHTS[c.w], {})
  checkChoices("recommendGems[" .. i .. "].choices", r.choices, c.choices)
  checkDeep("recommendGems[" .. i .. "].stats", r.stats, c.stats)
end
-- 13. recommendEnchants
for i, c in ipairs(fx.recommendEnchants) do
  local r = GemSolver.recommendEnchants(c.slots, WEIGHTS[c.w], c.perks, c.opts)
  checkNameMap("recommendEnchants[" .. i .. "].choices", r.choices, c.choices)
  checkDeep("recommendEnchants[" .. i .. "].stats", r.stats, c.stats)
end
-- 14. planItemGems
for i, c in ipairs(fx.planItemGems) do
  local opts = {}
  if c.gate then opts.gateScale = WEIGHTS.uncrush end
  local r = GemSolver.planItemGems(c.item, WEIGHTS[c.w], {}, nil, opts)
  checkChoices("planItemGems[" .. i .. "].choices", r.choices, c.choices)
  checkDeep("planItemGems[" .. i .. "].stats", r.stats, c.stats)
  checkEq("planItemGems[" .. i .. "].metaCount", r.metaCount, c.metaCount)
end
-- 15. solveLoadout
for i, c in ipairs(fx.solveLoadout) do
  local opts = {}
  if c.opts.maxPhase ~= nil then opts.maxPhase = c.opts.maxPhase end
  if c.opts.atCap ~= nil then opts.atCapWeights = WEIGHTS.ehp end
  local r = GemSolver.solveLoadout(c.set, WEIGHTS[c.w], c.perks, opts)
  checkChoices("solveLoadout[" .. i .. "].gemChoices", r.gems.choices, c.gemChoices)
  checkDeep("solveLoadout[" .. i .. "].gemStats", r.gems.stats, c.gemStats)
  checks = checks + 1
  local ok = (#r.gems.metas == #c.metas)
  if ok then for j = 1, #c.metas do
    if r.gems.metas[j].name ~= c.metas[j].name or r.gems.metas[j].active ~= c.metas[j].active then ok = false; break end
  end end
  if not ok then fail("solveLoadout[" .. i .. "].metas", "meta list mismatch") end
  checkNameMap("solveLoadout[" .. i .. "].enchants", r.enchants.choices, c.enchants)
  checkDeep("solveLoadout[" .. i .. "].addedStats", r.addedStats, c.addedStats)
end

if failures == 0 then
  print(string.format("PASS  solver parity: %d checks matched within %g", checks, EPS))
  os.exit(0)
else
  print(string.format("FAILED  %d/%d solver checks", failures, checks))
  os.exit(1)
end

-- Lua-side parity check for the ported forward model.
-- Loads the generated engine/Constants.lua + CharacterData.lua and the hand-ported Model.lua (all
-- pure — no WoW API) with an injected addon namespace, then asserts Model.aggregate/talentsFromRanks
-- reproduce the JS goldens within epsilon.
--
-- Run from the repo root with any Lua 5.1+ interpreter:
--     lua test/lua/model_parity.lua
-- (Regenerate goldens with `npm run gen-model-fixtures`; regenerate CharacterData.lua with `npm run gen-lua`.)

local ENGINE = "addon/TankadinGearSim/engine/"
local EPS = 1e-9

local ns = { engine = {} }
local function loadEngine(file)
  local chunk = assert(loadfile(ENGINE .. file))
  return chunk("TankadinGearSim", ns)
end
loadEngine("Constants.lua")
loadEngine("CharacterData.lua")
loadEngine("Model.lua")
local Model = ns.engine.Model

local fx = assert(loadfile("test/lua/model_fixtures.lua"))()

local failures, checks = 0, 0
local function check(label, got, want)
  checks = checks + 1
  local ok
  if type(want) == "number" then ok = type(got) == "number" and math.abs(got - want) <= EPS
  else ok = got == want end
  if not ok then
    failures = failures + 1
    print(string.format("FAIL  %-40s got=%s want=%s", label, tostring(got), tostring(want)))
  end
end

-- aggregate()
for _, case in ipairs(fx.aggregate) do
  local got = Model.aggregate(case.items, case.opts)
  for key, want in pairs(case.expected) do
    check(case.name .. "." .. key, got[key], want)
  end
end

-- talentsFromRanks()
for _, case in ipairs(fx.talents) do
  local got = Model.talentsFromRanks(case.ranks)
  for key, want in pairs(case.expected) do
    check("talents " .. case.name .. "." .. key, got[key], want)
  end
end

if failures == 0 then
  print(string.format("PASS  model parity: %d checks matched within %g", checks, EPS))
  os.exit(0)
else
  print(string.format("FAILED  %d/%d model checks", failures, checks))
  os.exit(1)
end

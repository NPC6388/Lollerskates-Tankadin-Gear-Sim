-- Lua-side parity check for the ported scoring core.
-- Loads the generated engine/Weights.lua + hand-ported engine/Scoring.lua (both pure — no WoW API)
-- with an injected addon namespace, then asserts Scoring.score/blendScale reproduce the JS goldens.
--
-- Run from the repo root with any Lua 5.1+ interpreter:
--     lua test/lua/scoring_parity.lua
-- (Regenerate goldens with `npm run gen-scoring-fixtures`; regenerate Weights.lua with `npm run gen-lua`.)

local ENGINE = "addon/TankadinGearSim/engine/"
local EPS = 1e-9

local ns = { engine = {} }
local function loadEngine(file)
  local chunk = assert(loadfile(ENGINE .. file))
  return chunk("TankadinGearSim", ns)
end
loadEngine("Weights.lua")
loadEngine("Scoring.lua")
local Scoring = ns.engine.Scoring

local fx = assert(loadfile("test/lua/scoring_fixtures.lua"))()

local failures, checks = 0, 0
local function check(label, got, want)
  checks = checks + 1
  if type(got) ~= "number" or math.abs(got - want) > EPS then
    failures = failures + 1
    print(string.format("FAIL  %-40s got=%s want=%s", label, tostring(got), tostring(want)))
  end
end

-- 1. score(block, namedScale)
for _, case in ipairs(fx.scaleScores) do
  for scaleName, want in pairs(case.scores) do
    check(case.block .. " x " .. scaleName, Scoring.scoreByScale(case.stats, scaleName), want)
  end
end

-- 2. blendScale(ratio) key-by-key
for _, case in ipairs(fx.blends) do
  local got = Scoring.blendScale(case.ratio)
  for k, want in pairs(case.scale) do
    check("blend " .. case.name .. "." .. k, got[k], want)
  end
end

-- 3. score(block, blendScale(ratio)) end-to-end. Re-derive the block stats from scaleScores.
local statsByBlock = {}
for _, case in ipairs(fx.scaleScores) do statsByBlock[case.block] = case.stats end
local RATIOS = {}
for _, case in ipairs(fx.blends) do RATIOS[case.name] = case.ratio end
for _, case in ipairs(fx.blendScores) do
  local stats = statsByBlock[case.block]
  for ratioName, want in pairs(case.scores) do
    check(case.block .. " blend " .. ratioName, Scoring.score(stats, Scoring.blendScale(RATIOS[ratioName])), want)
  end
end

if failures == 0 then
  print(string.format("PASS  scoring parity: %d checks matched within %g", checks, EPS))
  os.exit(0)
else
  print(string.format("FAILED  %d/%d scoring checks", failures, checks))
  os.exit(1)
end

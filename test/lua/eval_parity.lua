-- Lua-side parity check for the ported engine.
-- Loads engine/Constants|Combat|Evaluate.lua (all pure — no WoW API) with an injected addon
-- namespace, then asserts the Lua evaluateSet reproduces the JS golden fixtures within epsilon.
--
-- Run from the repo root with any Lua 5.1+ interpreter:
--     lua test/lua/eval_parity.lua
-- (No interpreter on the box? The same math is verified in-game by the Live readout; and the JS
-- side is covered by test/sheet-parity.test.js. Regenerate goldens with `npm run gen-fixtures`.)

local ENGINE = "addon/TankadinGearSim/engine/"
local EPS = 1e-6

-- Shared namespace, same shape WoW passes to each addon file via `local ADDON, ns = ...`.
local ns = { engine = {} }
local function loadEngine(file)
  local chunk = assert(loadfile(ENGINE .. file))
  return chunk("TankadinGearSim", ns)
end
loadEngine("Constants.lua")
loadEngine("Combat.lua")
loadEngine("Evaluate.lua")

local fixtures = assert(loadfile("test/lua/fixtures.lua"))()

local function approx(a, b)
  if a == nil and b == nil then return true end
  if type(a) == "boolean" or type(b) == "boolean" then return a == b end
  if type(a) ~= "number" or type(b) ~= "number" then return a == b end
  return math.abs(a - b) <= EPS
end

local failures, checks = 0, 0
for _, case in ipairs(fixtures) do
  local got = ns.engine.Evaluate.evaluateSet(case.input)
  for key, want in pairs(case.expected) do
    checks = checks + 1
    if not approx(got[key], want) then
      failures = failures + 1
      print(string.format("FAIL  %-14s %-22s got=%s want=%s",
        case.name, key, tostring(got[key]), tostring(want)))
    end
  end
end

if failures == 0 then
  print(string.format("PASS  %d fixtures, %d field checks matched within %g", #fixtures, checks, EPS))
  os.exit(0)
else
  print(string.format("FAILED  %d/%d field checks", failures, checks))
  os.exit(1)
end

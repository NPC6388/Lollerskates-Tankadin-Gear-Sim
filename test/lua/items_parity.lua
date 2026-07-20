-- Lua-side parity check for the ported item-object builder.
-- Loads the generated ItemsData.lua + CharacterData.lua (for STAT_KEYS) and the hand-ported Items.lua,
-- then asserts Items.build() reproduces the JS import.js goldens (deep table compare).
--
--     lua test/lua/items_parity.lua
-- (Regenerate goldens: npm run gen-items-fixtures; regenerate ItemsData.lua: npm run gen-lua.)

local ENGINE = "addon/TankadinGearSim/engine/"
local EPS = 1e-9

local ns = { engine = {} }
local function loadEngine(file) return assert(loadfile(ENGINE .. file))("TankadinGearSim", ns) end
loadEngine("CharacterData.lua") -- Items needs STAT_KEYS
loadEngine("ItemsData.lua")
loadEngine("LibramsData.lua") -- Items.build applies the libram effective-stat override
loadEngine("Librams.lua")
loadEngine("ProcsData.lua") -- ...and adds modeled proc-trinket stats on top
loadEngine("Procs.lua")
loadEngine("Items.lua")
local Items = ns.engine.Items

local fx = assert(loadfile("test/lua/items_fixtures.lua"))()

local failures, checks = 0, 0
local function fail(path, got, want)
  failures = failures + 1
  print(string.format("FAIL  %-32s got=%s want=%s", path, tostring(got), tostring(want)))
end

local function deepeq(got, want, path)
  checks = checks + 1
  if type(got) ~= type(want) then return fail(path, got, want) end
  if type(want) == "table" then
    for k, v in pairs(want) do deepeq(got[k], v, path .. "." .. tostring(k)) end
    for k in pairs(got) do if want[k] == nil then fail(path .. "." .. tostring(k), got[k], nil) end end
  elseif type(want) == "number" then
    if math.abs(got - want) > EPS then fail(path, got, want) end
  elseif got ~= want then
    fail(path, got, want)
  end
end

for i, case in ipairs(fx) do
  local built = Items.build(case.raw)
  local tag = (case.raw.name or ("#" .. i))
  for field, want in pairs(case.expected) do
    deepeq(built[field], want, tag .. "." .. field)
  end
end

if failures == 0 then
  print(string.format("PASS  items parity: %d checks matched within %g", checks, EPS))
  os.exit(0)
else
  print(string.format("FAILED  %d checks (of %d)", failures, checks))
  os.exit(1)
end

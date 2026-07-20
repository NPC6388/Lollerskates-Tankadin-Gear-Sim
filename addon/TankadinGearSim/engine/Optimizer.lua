-- Optimizer — Lua port of src/optimizer.js: pick the best LEGAL set from a pool of owned items.
-- Objective is a builtin ('spellPower'/'ehp') or a weight-SCALE blend ('scale' + goal.scaleWeights);
-- hard gates are crit immunity (always) + uncrushable (when required) + a Min-HP floor. Provides the
-- exhaustive solver and the greedy+repair+climb heuristic. Parity-checked by test/lua/optimizer_parity.lua.
--
-- Slot iteration ORDER is load-bearing for tie-breaks (the first max-efficiency swap wins), and Lua
-- tables have no key order, so buildPool returns an explicit `order` array (matching JS Object.keys(pool)
-- insertion order) that every search iterates. Seed picks use a first-max scan (== JS stable-sort [0]).

local ADDON, ns = ...
ns.engine = ns.engine or {}
local Model = ns.engine.Model
local Evaluate = ns.engine.Evaluate
local Scoring = ns.engine.Scoring
local Sets = ns.engine.Sets
local W = ns.engine.Weights
local C = ns.engine.Constants
local BASE, CAPS = C.BASE, C.CAPS

local Optimizer = {}
ns.engine.Optimizer = Optimizer

-- Cooperative-yield hook: when ns.engine.onTick is set (by the async frame driver, AsyncSearch.lua) it's
-- called at heavy-loop boundaries so a long search can yield across frames. nil in the sync/parity path
-- (a no-op), so it can't change results — only WHEN they're produced.
local function tick() local f = ns.engine.onTick; if f then f() end end

local PAIRS = { ring = { "ring1", "ring2" }, trinket = { "trinket1", "trinket2" } }

-- Build a slot pool from a flat item list: group by slot (first-seen order), expand paired ring/trinket
-- slots (distinct groups that must hold different items), exclude 2H weapons, apply locks. Mirrors
-- optimizer.js:buildPool; also returns `order` (the slot iteration order every search uses).
function Optimizer.buildPool(items, opts)
  opts = opts or {}
  local lock = opts.lock or {}
  local exclude2H = opts.exclude2H
  if exclude2H == nil then exclude2H = true end
  local grouped, groupOrder = {}, {}
  for _, it in ipairs(items) do
    if it.slot and not (exclude2H and it.equipLoc == "INVTYPE_2HWEAPON") then
      if not grouped[it.slot] then grouped[it.slot] = {}; groupOrder[#groupOrder + 1] = it.slot end
      local g = grouped[it.slot]; g[#g + 1] = it
    end
  end
  local pool, order, distinct = {}, {}, {}
  for _, slot in ipairs(groupOrder) do
    local list = grouped[slot]
    local pr = PAIRS[slot]
    if pr then
      pool[pr[1]] = list
      local copy = {}; for i, v in ipairs(list) do copy[i] = v end
      pool[pr[2]] = copy
      order[#order + 1] = pr[1]; order[#order + 1] = pr[2]
      distinct[#distinct + 1] = { pr[1], pr[2] }
    else
      pool[slot] = list
      order[#order + 1] = slot
    end
  end
  local locked = {}
  for slotKey, ref in pairs(lock) do
    local id = type(ref) == "table" and ref.itemId or ref
    local searchList = pool[slotKey] or items
    local found
    for _, it in ipairs(searchList) do if it.itemId == id then found = it; break end end
    if found then pool[slotKey] = { found }; locked[slotKey] = found end
  end
  return { pool = pool, order = order, distinct = distinct, locked = locked }
end

-- Every distinct-group must hold unique itemIds. Mirrors optimizer.js:distinctOk.
function Optimizer.distinctOk(sel, distinct)
  for _, group in ipairs(distinct or {}) do
    local seen = {}
    for _, s in ipairs(group) do
      local it = sel[s]
      if it and it.itemId ~= nil then
        if seen[it.itemId] then return false end
        seen[it.itemId] = true
      end
    end
  end
  return true
end

local function crushTarget(gates)
  gates = gates or {}
  -- Solver target = crush cap (or Illidan's 101.8% Shear target / an explicit override) + the safety
  -- margin (ratings-vs-sheet gap; see C.crushTargetFor). Live readout stays on the raw caps.
  return C.crushTargetFor(gates.enc, gates.uncrushableTarget)
end

-- The avoidance the crush gate measures: normally the full combined figure; for the encounter presets
-- (gates.enc) the reduced avoidance that fight leaves you, so SELECTION targets the same gate finalLegal
-- checks (Illidan drops miss; Sunwell cuts miss+dodge). Mirrors optimizer.js:crushAvoid.
local function crushAvoid(evald, gates)
  if gates.enc == "sunwell" then return evald.swpAvoidance
  elseif gates.enc == "illidan" then return evald.illyAvoidance end
  return evald.totalAvoidanceWithHS
end

local function gatesPass(evald, gates)
  gates = gates or {}
  local critOk
  if gates.raid == false then critOk = evald.heroicCritImmune else critOk = evald.raidCritImmune end
  local crushOk = (not gates.requireUncrushable) or (crushAvoid(evald, gates) + 1e-9 >= crushTarget(gates))
  local hpOk = (not gates.minHealth) or ((evald.health or 0) + 1e-9 >= gates.minHealth)
  return { critOk = critOk, crushOk = crushOk, hpOk = hpOk, all = critOk and crushOk and hpOk }
end
Optimizer.gatesPass = gatesPass

-- Deficit from satisfying the required gates (0 = legal). Crit/crush in %-points; Min-HP shortfall
-- /1000 so it reads in the same magnitude. Mirrors optimizer.js:gateDeficit.
local function gateDeficit(evald, gates)
  gates = gates or {}
  local critTarget = (gates.raid == false) and BASE.heroicBossCritVsPlayer or BASE.bossCritVsPlayer
  local critDef = math.max(0, critTarget - evald.critReduction)
  local crushDef = gates.requireUncrushable and math.max(0, crushTarget(gates) - crushAvoid(evald, gates)) or 0
  local hpDef = gates.minHealth and math.max(0, (gates.minHealth - (evald.health or 0)) / 1000) or 0
  return critDef + crushDef + hpDef
end
Optimizer.gateDeficit = gateDeficit

-- Resolve a goal's objective into a fn(evald, agg, items) -> number. Mirrors optimizer.js:objectiveFn.
local function objectiveFn(goal)
  local obj = goal.objective
  if type(obj) == "function" then return obj end
  if obj == "scale" then
    local w = goal.scaleWeights or W.SCALES[goal.scale]
    assert(w, "scale objective needs goal.scale or goal.scaleWeights")
    return function(_e, _a, items)
      return Scoring.score(Model.sumStats(items), w) + Scoring.score(Sets.setBonusStats(items), w)
    end
  end
  if obj == "spellPower" then return function(e) return e.spellPower end end
  if obj == "ehp" then return function(e) return e.ehpPhysical or 0 end end
  error("Unknown objective: " .. tostring(obj))
end

-- Items are collected in SORTED SLOT ORDER, never raw `pairs()` order. aggregate/score are sums, so
-- slot order is mathematically irrelevant — but floating-point addition is NOT associative, so a
-- different traversal order shifts the total by an ULP, and Lua 5.2+ seeds its string hash per state,
-- making `pairs()` order vary run to run. That was enough to flip exactly-tied gems and items between
-- runs (the intermittent runner_parity failures: Solid Star of Elune vs Subtle Living Ruby, a ring2
-- id flip). JS iterates `Object.values(selection)` in stable insertion order, so only Lua drifted.
-- Sorting the slot keys makes every sum reproducible. (Runner.lua's gemSet already walks `order` for
-- the same reason.)
local function selItems(selection)
  local keys = {}
  for k in pairs(selection) do keys[#keys + 1] = k end
  table.sort(keys)
  local items = {}
  for _, k in ipairs(keys) do
    local it = selection[k]
    if it then items[#items + 1] = it end
  end
  return items
end

local function build(selection, goal)
  local items = selItems(selection)
  local agg = Model.aggregate(items, goal)
  return { selection = selection, items = items, agg = agg, evald = Evaluate.evaluateSet(agg) }
end

local function copySel(sel, k, v)
  local out = {}
  for kk, vv in pairs(sel) do out[kk] = vv end
  if k ~= nil then out[k] = v end
  return out
end

-- Exhaustive: cartesian product over slots (in `order`), guarded against blow-up. Honors distinctness
-- and locks (single-candidate slots from buildPool). Mirrors optimizer.js:optimizeExhaustive.
function Optimizer.optimizeExhaustive(pool, order, goal, opts)
  opts = opts or {}
  local distinct = opts.distinct or {}
  local space = 1
  for _, s in ipairs(order) do space = space * #pool[s] end
  if space > 500000 then error("Exhaustive space too large (" .. space .. "); use the heuristic.") end
  local objFn = objectiveFn(goal)
  local best = nil
  local n = #order
  local function rec(i, sel)
    if i > n then
      if not Optimizer.distinctOk(sel, distinct) then return end
      local b = build(sel, goal)
      if gatesPass(b.evald, goal.gates).all then
        local v = objFn(b.evald, b.agg, b.items)
        if best == nil or v > best.objectiveValue then
          best = { selection = sel, items = b.items, agg = b.agg, evald = b.evald, objectiveValue = v, legal = true }
        end
      end
      return
    end
    local s = order[i]
    for _, it in ipairs(pool[s]) do
      if i == 1 then tick() end
      rec(i + 1, copySel(sel, s, it))
    end
  end
  rec(1, {})
  return best -- nil if no legal set exists
end

-- Heuristic: start from the best-objective item per slot, repair toward the gates (the swap that removes
-- the most deficit per unit of objective sacrificed) until legal, then climb (trade surplus back into the
-- objective while staying legal). `opts.seed` (slot -> itemId) overrides the starting pick for a slot.
-- Mirrors optimizer.js:optimizeHeuristic.
function Optimizer.optimizeHeuristic(pool, order, goal, opts)
  opts = opts or {}
  local distinct = opts.distinct or {}
  local locked = opts.locked or {}
  local seed = opts.seed or {}
  local objFn = objectiveFn(goal)
  local function singleObj(it)
    local a = Model.aggregate({ it }, goal)
    return objFn(Evaluate.evaluateSet(a), a, { it })
  end

  local sel = {}
  for _, s in ipairs(order) do
    local chosen
    if locked[s] then
      chosen = locked[s]
    elseif seed[s] ~= nil then
      for _, v in ipairs(pool[s]) do if v.itemId == seed[s] then chosen = v; break end end
    end
    if not chosen then -- first-max by singleObj (earliest max wins == JS stable sort [0])
      local best, bestScore
      for _, v in ipairs(pool[s]) do
        local sc = singleObj(v)
        if best == nil or sc > bestScore then best = v; bestScore = sc end
      end
      chosen = best
    end
    sel[s] = chosen
  end

  -- Resolve paired duplicates: keep the first, bump the rest to their next distinct candidate.
  for _, group in ipairs(distinct) do
    local used = {}
    for _, s in ipairs(group) do
      if locked[s] then
        if sel[s] then used[sel[s].itemId] = true end
      elseif sel[s] and not used[sel[s].itemId] then
        used[sel[s].itemId] = true
      else
        local repl
        for _, it in ipairs(pool[s]) do if not used[it.itemId] then repl = it; break end end
        if repl then sel[s] = repl; used[repl.itemId] = true end
      end
    end
  end
  local cur = build(sel, goal)

  for _ = 1, 300 do
    tick()
    local curDef = gateDeficit(cur.evald, goal.gates)
    if curDef <= 1e-9 then break end
    local curObj = objFn(cur.evald, cur.agg, cur.items)
    local bestSwap = nil
    for _, s in ipairs(order) do
      if not locked[s] then
        for _, cand in ipairs(pool[s]) do
          if cand ~= sel[s] then
            local trialSel = copySel(sel, s, cand)
            if Optimizer.distinctOk(trialSel, distinct) then
              local trial = build(trialSel, goal)
              local dRed = curDef - gateDeficit(trial.evald, goal.gates)
              if dRed > 1e-9 then
                local objLoss = curObj - objFn(trial.evald, trial.agg, trial.items)
                local efficiency = objLoss <= 0 and math.huge or dRed / objLoss
                if bestSwap == nil or efficiency > bestSwap.efficiency then
                  bestSwap = { s = s, cand = cand, efficiency = efficiency, trial = trial }
                end
              end
            end
          end
        end
      end
    end
    if not bestSwap then break end
    sel[bestSwap.s] = bestSwap.cand
    cur = bestSwap.trial
  end

  -- Climb: once legal, convert surplus (avoidance over the cap) into the objective, staying legal.
  if gatesPass(cur.evald, goal.gates).all then
    for _ = 1, 300 do
      tick()
      local curObj = objFn(cur.evald, cur.agg, cur.items)
      local bestSwap = nil
      for _, s in ipairs(order) do
        if not locked[s] then
          for _, cand in ipairs(pool[s]) do
            if cand ~= sel[s] then
              local trialSel = copySel(sel, s, cand)
              if Optimizer.distinctOk(trialSel, distinct) then
                local trial = build(trialSel, goal)
                if gatesPass(trial.evald, goal.gates).all then
                  local gain = objFn(trial.evald, trial.agg, trial.items) - curObj
                  if gain > 1e-9 and (bestSwap == nil or gain > bestSwap.gain) then
                    bestSwap = { s = s, cand = cand, gain = gain, trial = trial }
                  end
                end
              end
            end
          end
        end
      end
      if not bestSwap then break end
      sel[bestSwap.s] = bestSwap.cand
      cur = bestSwap.trial
    end
  end

  local legal = gatesPass(cur.evald, goal.gates).all and Optimizer.distinctOk(sel, distinct)
  return {
    selection = cur.selection, items = cur.items, agg = cur.agg, evald = cur.evald,
    objectiveValue = objFn(cur.evald, cur.agg, cur.items), legal = legal,
  }
end

-- Convenience wrapper: heuristic by default, exhaustive when asked. Mirrors optimizer.js:optimize.
function Optimizer.optimize(pool, order, goal, opts)
  opts = opts or {}
  if opts.exhaustive then
    return Optimizer.optimizeExhaustive(pool, order, goal, { distinct = opts.distinct })
  end
  return Optimizer.optimizeHeuristic(pool, order, goal, { distinct = opts.distinct, locked = opts.locked })
end

return Optimizer

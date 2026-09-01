-- Runner — Lua port of src/runner.js: the four-set optimization orchestration. Given a live item pool it
-- returns the player's tuned sets (raid threat / survival / AOE trash / balanced), each gemmed/enchanted
-- with crit/crush status. This ties together everything ported so far: item focus/cap gem variants →
-- Optimizer search → per-item socket-bonus-aware gemming (GemSolver) + meta resolution → gate recovery,
-- overshoot reclaim, meta repair, near-alternatives. Parity-checked by test/lua/runner_parity.lua.
--
-- Slot iteration order is threaded through from Optimizer.buildPool's `order` array (Lua has no table key
-- order) so gemChoices/plan order and swap tie-breaks match the JS exactly. Sorts that JS relies on being
-- stable carry an explicit original-index tie-break here.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local Model = ns.engine.Model
local Evaluate = ns.engine.Evaluate
local Scoring = ns.engine.Scoring
local Gems = ns.engine.Gems
local Enchants = ns.engine.Enchants
local GemSolver = ns.engine.GemSolver
local Optimizer = ns.engine.Optimizer
local Professions = ns.engine.Professions
local Scrolls = ns.engine.Scrolls
local Librams = ns.engine.Librams
local C = ns.engine.Constants
local D = ns.engine.CharacterData
local CAPS, RATING = C.CAPS, C.RATING
local SCALES = ns.engine.Weights.SCALES
local BUFFS, TALENTS, STAT_KEYS = D.BUFFS, D.TALENTS, D.STAT_KEYS
local GEMS = ns.engine.GemsData.GEMS
local META_GEMS = ns.engine.GemsData.META_GEMS
local CURRENT_PHASE = ns.engine.GemsData.CURRENT_PHASE
local ENCHANTS = ns.engine.EnchantsData.ENCHANTS
local FITS = Gems.FITS

local Runner = {}
ns.engine.Runner = Runner

-- Cooperative-yield hook (see engine/Optimizer.lua): no-op unless the async frame driver sets it.
local function tick() local f = ns.engine.onTick; if f then f() end end

local HS = 30                              -- Holy Shield +30% block in the uncrushable check
local CAP_SCALE = SCALES.survivalUncrushable -- gems that most cheaply buy avoidance/defense
local ALT_EPS = 0.01                       -- a slot alternative is "near-identical" within 1% of the whole-set objective
local ALT_MAX = 3                          -- at most this many alternatives shown per slot
Runner.DEFAULT_TRINKET_LOCKS = { icon = 29370, eye = 28789 }

-- Encounter-adjusted crush avoidance / uncrushable (see engine/Evaluate.lua). enc = "illidan"|"sunwell"|nil.
local function encAvoid(e, enc)
  if enc == "sunwell" then return e.swpAvoidance elseif enc == "illidan" then return e.illyAvoidance end
  return e.totalAvoidanceWithHS
end
-- Raw uncrushable flag (true 102.4 cap) for this encounter — matches src/runner.js encUncrush. This is
-- only the trigger for the secondary max-HP recovery pass (solveGoal below): the optimizer's own repair
-- already aims for the MARGINED target via crushTarget, and finalLegal certifies against it, so this just
-- asks "is the set already past the real crush cap?" before spending effort on the max-HP reseed.
local function encUncrush(e, enc)
  if enc == "sunwell" then return e.swpUncrushable elseif enc == "illidan" then return e.illyUncrushable end
  return e.uncrushable
end

-- Preset goals as tunable EHP:threat ratios (blendScale builds the objective).
Runner.GOAL_PRESETS = {
  { id = "raid", name = "Raid Threat", focus = "EHP : threat 1:2", ratio = { ehp = 1, threat = 2 }, gates = { raid = true, requireUncrushable = true }, lockEye = true },
  { id = "survival", name = "Survival", focus = "EHP : threat 2:1", ratio = { ehp = 2, threat = 1 }, gates = { raid = true, requireUncrushable = true }, lockEye = false },
  { id = "aoe", name = "AOE Trash", focus = "AOE threat (trash <=72 - no crushing blows)", ratio = { ehp = 1, aoeThreat = 2 }, gates = { raid = true, requireUncrushable = false }, lockEye = true },
  { id = "balanced", name = "Balanced", focus = "EHP : threat 1:1", ratio = { ehp = 1, threat = 1 }, gates = { raid = true, requireUncrushable = true }, lockEye = true },
  -- Encounter sets (mirrors src/runner.js). Gate measured on the avoidance that fight leaves you (Illidan
  -- Shear can't miss, 101.8% target; Sunwell Radiance = boss +5% hit / -20% dodge). In SWP only Lady
  -- Sacrolash crushes, and a core set (Survival) covers her, so:
  --  * Illidan  - Shear gate REQUIRED, threat-lean.
  --  * Sunwell  - general SWP: crush gate RELAXED, EHP focus but high avoidance (ehp scale), lockEye off.
  --               Shows the Radiance-reduced avoidance (ungated) as a Sacrolash reference.
  --  * Brutallus- pure EHP goal (>20k HP): gate relaxed + ratio pushed to survival (ehp+sta, no threat).
  { id = "illidan", name = "Illidan", focus = "Illidan gate - lean threat", ratio = { ehp = 1, threat = 2 }, gates = { raid = true, requireUncrushable = true }, lockEye = true, enc = "illidan" },
  { id = "sunwell", name = "Sunwell", focus = "no crush - EHP + avoidance", ratio = { ehp = 3, threat = 1 }, gates = { raid = true, requireUncrushable = false }, lockEye = false, enc = "sunwell" },
  { id = "brutallus", name = "Brutallus", focus = "all the EHP you can get", ratio = { ehp = 2, sta = 1 }, gates = { raid = true, requireUncrushable = false }, lockEye = false, enc = "sunwell" },
}

-- --- id -> name lookups (report a locked item's current gems/enchant) --------------------------
local GEM_BY_ID = {}
for _, g in ipairs(GEMS) do if g.id then GEM_BY_ID[g.id] = g end end
for _, g in ipairs(META_GEMS) do if g.id then GEM_BY_ID[g.id] = g end end
local META_BY_NAME = {}
for _, g in ipairs(META_GEMS) do META_BY_NAME[g.name] = g end
local ENCHANT_BY_EFFECT = {}
for _, list in pairs(ENCHANTS) do for _, e in ipairs(list) do if e.enchant then ENCHANT_BY_EFFECT[e.enchant] = e end end end

local function currentGems(it)
  local out = {}
  for _, id in ipairs(it.gems or {}) do
    local g = GEM_BY_ID[id]
    if g then out[#out + 1] = { name = g.name, id = g.id }
    else out[#out + 1] = { name = "Gem " .. id, id = id } end
  end
  return out
end
local function currentEnchant(it)
  local id = it.enchantId
  if not id or id == 0 then return nil end
  local e = ENCHANT_BY_EFFECT[id]
  if e then return { name = e.name, id = e.id or nil, spell = e.spell or nil, effectId = e.enchant or id } end
  return { name = "Enchant " .. id, id = nil, spell = nil, effectId = id }
end

-- --- stat helpers ------------------------------------------------------------------------------
local function baseOf(it)
  local b = it.baseStats
  if b and next(b) ~= nil then return b end
  return it.stats or {}
end
local function sumInto(into, s, m)
  m = m or 1
  for k, v in pairs(s or {}) do into[k] = (into[k] or 0) + v * m end
end
local function hasSockets(it)
  local s = it.sockets or {}
  return (s.red or s.yellow or s.blue or s.meta) and true or false
end
-- `worn` forces the AS-SOCKETED stats (`_wornStats`) rather than a variant's simulated gemming —
-- used by the monotonicity guard, which prices the gems literally sitting in the gear today.
local function lockedDelta(it, worn)
  local base, res = baseOf(it), (worn and it._wornStats or it.stats) or {}
  local out = {}
  for _, k in ipairs(STAT_KEYS) do
    local d = (res[k] or 0) - (base[k] or 0)
    if d ~= 0 then out[k] = d end
  end
  return out
end

-- Is an item complete enough to lock? (every socket filled AND slot takes no enchant / already has one.)
local function lockEligible(item, opts)
  opts = opts or {}
  local perks = opts.perks or { names = {} }
  local s = item.sockets or {}
  local socketCount = (s.red or 0) + (s.yellow or 0) + (s.blue or 0) + (s.meta or 0)
  if #(item.gems or {}) < socketCount then return false end
  local en = Enchants.bestEnchant(item.slot, opts.objScale or SCALES.balanced, perks, { faction = opts.faction, maxPhase = opts.maxPhase })
  if en and (not item.enchantId or item.enchantId == 0) then return false end
  return true
end

-- Normalize the keepGemsEnchants option -> { pred, ignoreCompleteness } or nil. Mirrors runner.js:keepConfig.
local function keepConfig(spec)
  if not spec then return nil end
  if spec == true then return { pred = function() return true end, ignoreCompleteness = false } end
  if type(spec) == "table" and spec[1] ~= nil then -- array of itemIds
    local set = {}
    for _, id in ipairs(spec) do set[id] = true end
    if next(set) == nil then return nil end
    return { pred = function(it) return set[it.itemId] == true end, ignoreCompleteness = false }
  end
  local ids = {}
  for _, id in ipairs(spec.itemIds or {}) do ids[id] = true end
  local slots = {}
  for _, sl in ipairs(spec.slots or {}) do slots[sl] = true end
  local equippedOnly = spec.equippedOnly and true or false
  if next(ids) == nil and next(slots) == nil and not equippedOnly then return nil end
  local pred = function(it)
    return (equippedOnly and it.equipped and true) or ids[it.itemId] == true or slots[it.slot] == true
  end
  return { pred = pred, ignoreCompleteness = spec.ignoreCompleteness and true or false }
end

local function metaOptsFor(ctx)
  local o = {}
  if ctx.maxPhase then o.maxPhase = ctx.maxPhase end
  if ctx.metaExclude and #ctx.metaExclude > 0 then o.exclude = ctx.metaExclude end
  return o
end

-- Approximate (raw-gem) stats for one gem intent — drives SELECTION; final gems recomputed later.
local function buildVariant(it, gemScale, enchScale, ctx)
  local perks, maxPhase, faction = ctx.perks, ctx.maxPhase, ctx.faction
  local gOpts = { jewelcrafting = perks.jcGems and true or false }
  if maxPhase then gOpts.maxPhase = maxPhase end
  local metaOpts = metaOptsFor(ctx)
  local stats = {}
  sumInto(stats, baseOf(it))
  local sock = it.sockets or {}
  local colored = {}
  for _, c in ipairs({ "red", "yellow", "blue" }) do
    local n = sock[c] or 0
    if n > 0 then
      local g = Gems.bestGem(gemScale, gOpts)
      if g then
        for _ = 1, n do colored[#colored + 1] = g.gem end
        sumInto(stats, g.gem.stats, n)
      end
    end
  end
  if sock.meta then
    local counts = { red = 0, yellow = 0, blue = 0 }
    for _, g in ipairs(colored) do for _, col in ipairs(Gems.gemColors(g)) do if counts[col] ~= nil then counts[col] = counts[col] + 1 end end end
    local mOpts = { counts = counts }
    if metaOpts.maxPhase then mOpts.maxPhase = metaOpts.maxPhase end
    if metaOpts.exclude then mOpts.exclude = metaOpts.exclude end
    local m = Gems.bestMeta(gemScale, mOpts) or Gems.bestMeta(gemScale, metaOpts)
    if m then sumInto(stats, m.gem.stats, sock.meta) end
  end
  local en = Enchants.bestEnchant(it.slot, enchScale, perks, { faction = faction, maxPhase = maxPhase })
  if en then sumInto(stats, en.enchant.stats) end
  return stats
end

local function itemVariants(it, objScale, ctx)
  local function mk(tag, stats)
    local o = {}
    for k, v in pairs(it) do o[k] = v end
    o.stats = stats
    o._gem = tag
    -- `_wornStats` preserves the item's REAL resolved stats (gems + enchant as actually socketed);
    -- focus/cap variants overwrite `stats` with SIMULATED gemming, so the monotonicity guard's
    -- keep-all baseline reads this instead.
    o._wornStats = it.stats or {}
    return o
  end
  if ctx.keep and ctx.keep(it)
      and (ctx.keepIgnoreCompleteness or lockEligible(it, { perks = ctx.perks, faction = ctx.faction, maxPhase = ctx.maxPhase, objScale = objScale })) then
    local st = {}
    for k, v in pairs(it.stats or {}) do st[k] = v end
    return { mk("locked", st) }
  end
  local out = { mk("focus", buildVariant(it, objScale, objScale, ctx)) }
  if hasSockets(it) then out[#out + 1] = mk("cap", buildVariant(it, CAP_SCALE, objScale, ctx)) end
  -- AS-WORN VARIANT (mirrors runner.js): re-gem mode otherwise offers only SIMULATED gemmings, so the
  -- configuration already in the gear — attainable by definition — wasn't in the search space, and
  -- "re-gem everything" could land below the same solve with gems kept. Only for COMPLETE items with
  -- something actually applied: otherwise the focus variant fills the empty socket and dominates it.
  if not ctx.keep and ((it.gems and #it.gems > 0) or it.enchantId)
      and lockEligible(it, { perks = ctx.perks, faction = ctx.faction, maxPhase = ctx.maxPhase, objScale = objScale }) then
    local st = {}
    for k, v in pairs(it.stats or {}) do st[k] = v end
    out[#out + 1] = mk("locked", st)
  end
  return out
end

local function lockFor(goal, locks)
  -- Encounter sets free BOTH trinket slots (see runner.js:lockFor): they must reach a harder avoidance
  -- gate, trinkets are a big avoidance lever, and the model can't score proc/on-use trinkets anyway —
  -- locking a threat trinket makes the gate unreachable, freeing them lets the optimizer hit it.
  if goal.enc then return {} end
  local lock = {}
  if locks.icon then lock.trinket1 = locks.icon end
  if goal.lockEye and locks.eye then lock.trinket2 = locks.eye end
  return lock
end

-- Parse a meta's activation requirement into a color target. Mirrors runner.js:metaReq.
local function metaReq(requires)
  if not requires then return nil end
  local num, col = requires:match("(%d+)%+%s*(%a+)")
  if num and (col == "red" or col == "yellow" or col == "blue") then return { color = col, count = tonumber(num) } end
  if requires:find("more red than blue", 1, true) then return { gt = { "red", "blue" } } end
  if requires:find("more blue than red", 1, true) then return { gt = { "blue", "red" } } end
  return nil
end

-- Cheapest way (in objective points) to satisfy meta M's color requirement. Mirrors runner.js:enableMeta.
local function enableMeta(M, counts, recolorable, gemOpt, gemOptDual, objScale)
  if Gems.metaActivated(M, counts) then return { cost = 0, recolors = {} } end
  if M.requires and M.requires:find(",", 1, true) then return nil end
  local req = metaReq(M.requires)
  if not req then return { cost = 0, recolors = {} } end
  local color, deficit
  if req.color then color = req.color; deficit = req.count - counts[color]
  else color = req.gt[1]; deficit = (counts[req.gt[2]] - counts[req.gt[1]]) + 1 end
  if deficit <= 0 then return { cost = 0, recolors = {} } end
  local plain = gemOpt(color)
  if not plain then return nil end
  local cands = {}
  for idx, s in ipairs(recolorable) do
    local supplies = false
    for _, coll in ipairs(Gems.gemColors(s.c)) do if coll == color then supplies = true; break end end
    if not supplies then
      local tg = plain
      local sockCol = s.c.socket
      if s.p.v.socketBonus and sockCol and sockCol ~= color then tg = gemOptDual(color, sockCol) or plain end
      cands[#cands + 1] = { s = s, tg = tg, cost = Scoring.score(s.c.stats, objScale) - tg.score, idx = idx }
    end
  end
  if #cands < deficit then return nil end
  table.sort(cands, function(a, b) if a.cost ~= b.cost then return a.cost < b.cost end return a.idx < b.idx end)
  local recolors, cost = {}, 0
  for i = 1, deficit do recolors[#recolors + 1] = cands[i]; cost = cost + cands[i].cost end
  return { cost = cost, recolors = recolors }
end

local function metaChoice(M)
  local c = { socket = "meta" }
  for k, v in pairs(M) do c[k] = v end
  return c
end

-- META-AWARE gemming: choose the set's meta jointly with the colored gems, scored on the goal objective;
-- a color-gated meta can be ENABLED by recoloring the cheapest FOCUS sockets. Mutates plan.choices +
-- plan.stats, sets p.metas, returns the flat meta list. Mirrors runner.js:resolveMetas.
local function resolveMetas(plans, objScale, ctx)
  local perks, maxPhase = ctx.perks, ctx.maxPhase
  local metaExclude = ctx.metaExclude or {}
  local phase = maxPhase or CURRENT_PHASE
  local pool = {}
  for _, g in ipairs(META_GEMS) do
    if g.phase <= phase then
      local excluded = false
      for _, n in ipairs(metaExclude) do if n == g.name then excluded = true; break end end
      if not excluded then pool[#pool + 1] = g end
    end
  end
  local function gemOpt(color)
    local o = { socketColor = color, matchColor = true, jewelcrafting = perks.jcGems and true or false }
    if maxPhase then o.maxPhase = maxPhase end
    return Gems.bestGem(objScale, o)
  end
  local function gemOptDual(metaColor, socketColor)
    local o = { socketColor = metaColor, matchColor = true, alsoFits = socketColor, jewelcrafting = perks.jcGems and true or false }
    if maxPhase then o.maxPhase = maxPhase end
    return Gems.bestGem(objScale, o)
  end
  local all = {}
  for _, p in ipairs(plans) do
    for _, c in ipairs(p.plan.choices) do if c.color then all[#all + 1] = { p = p, c = c } end end
  end
  local recolorable = {}
  for _, s in ipairs(all) do if s.p.v._gem ~= "cap" then recolorable[#recolorable + 1] = s end end
  local lockedCount = { red = 0, yellow = 0, blue = 0 }
  for _, p in ipairs(plans) do
    if p.locked then
      for _, id in ipairs(p.v.gems or {}) do
        local g = GEM_BY_ID[id]
        if g then for _, col in ipairs(Gems.gemColors(g)) do if lockedCount[col] ~= nil then lockedCount[col] = lockedCount[col] + 1 end end end
      end
    end
  end
  local function tally()
    local cc = { red = lockedCount.red, yellow = lockedCount.yellow, blue = lockedCount.blue }
    for _, s in ipairs(all) do for _, col in ipairs(Gems.gemColors(s.c)) do if cc[col] ~= nil then cc[col] = cc[col] + 1 end end end
    return cc
  end

  local metas = {}
  for _, p in ipairs(plans) do
    local pMetas = {}
    for _ = 1, p.plan.metaCount do
      local counts = tally()
      local best = nil
      for _, M in ipairs(pool) do
        local en = enableMeta(M, counts, recolorable, gemOpt, gemOptDual, objScale)
        if en then
          local net = Scoring.score(M.stats, objScale) - en.cost
          if not best or net > best.net then best = { M = M, en = en, net = net } end
        end
      end
      if best then
        for _, r in ipairs(best.en.recolors) do
          sumInto(r.s.p.plan.stats, r.s.c.stats, -1)
          local keepSocket = r.s.c.socket
          local keys = {}
          for k in pairs(r.s.c) do keys[#keys + 1] = k end
          for _, k in ipairs(keys) do if k ~= "socket" then r.s.c[k] = nil end end
          for k, v in pairs(r.tg.gem) do r.s.c[k] = v end
          r.s.c.socket = keepSocket
          sumInto(r.s.p.plan.stats, r.s.c.stats, 1)
        end
        p.plan.choices[#p.plan.choices + 1] = metaChoice(best.M)
        sumInto(p.plan.stats, best.M.stats)
        local info = { name = best.M.name, active = true, requires = best.M.requires }
        pMetas[#pMetas + 1] = info
        metas[#metas + 1] = info
      end
    end
    p.metas = pMetas
  end
  local finalCounts = tally()
  for _, p in ipairs(plans) do
    if p.locked then
      for _, id in ipairs(p.v.gems or {}) do
        local g = GEM_BY_ID[id]
        if g and g.meta then
          local info = { name = g.name, active = Gems.metaActivated(g, finalCounts), requires = g.requires, kept = true }
          if not p.metas then p.metas = {} end
          p.metas[#p.metas + 1] = info
          metas[#metas + 1] = info
        end
      end
    end
  end
  return metas
end

-- --- The equipped set as the baseline every goal is measured against (mirrors runner.js) ---------
-- The set you are WEARING is always feasible, so it is both the natural place to start the search and
-- a floor on the answer: a recommendation scoring below your current gear is not a recommendation.
local PAIRS = { ring = { "ring1", "ring2" }, trinket = { "trinket1", "trinket2" } }

-- Equipped items -> a seed the heuristic understands ({ poolSlot = itemId }). Paired slots fill in
-- scan order (ring1 then ring2), matching buildPool's layout.
local function equippedSeed(items)
  local seed, used = {}, {}
  for _, it in ipairs(items) do
    if it.equipped and it.slot then
      local pair = PAIRS[it.slot]
      if not pair then
        seed[it.slot] = it.itemId
      else
        local n = used[it.slot] or 0
        if n < #pair then
          seed[pair[n + 1]] = it.itemId
          used[it.slot] = n + 1
        end
      end
    end
  end
  return seed
end

-- Does the equipped gear satisfy the constraints the PLAYER set for this goal — trinket locks and
-- pinned slots? If they locked or pinned an item they aren't wearing, the worn set violates a choice
-- they made explicitly, so it must NOT become the floor: honoring the pin matters more than the score.
local function equippedMeetsConstraints(items, goal, locks, pins)
  local worn = {}
  for _, it in ipairs(items) do if it.equipped then worn[it.itemId] = true end end
  for _, ref in pairs(lockFor(goal, locks)) do
    local id = (type(ref) == "table") and ref.itemId or ref
    if not worn[id] then return false end
  end
  for _, id in pairs((pins or {})[goal.id] or {}) do
    if not worn[tonumber(id) or id] then return false end
  end
  return true
end

local function runGoal(goal, items, ctx, seed)
  tick()
  seed = seed or {}
  local perks, buff, maxPhase, faction, locks, talents = ctx.perks, ctx.buff, ctx.maxPhase, ctx.faction, ctx.locks, ctx.talents
  local enc = goal.enc or ctx.encounter or nil -- per-goal encounter gate (Illy/SWP presets); ctx fallback for back-compat
  local aggOpts = { hsBlockBonus = HS }
  if buff then for k, v in pairs(buff) do aggOpts[k] = v end end
  if talents then aggOpts.talents = talents end
  local objScale = Scoring.blendScale(goal.ratio)
  local prepared = {}
  for _, it in ipairs(items) do
    for _, v in ipairs(itemVariants(it, objScale, ctx)) do prepared[#prepared + 1] = v end
  end
  local bp = Optimizer.buildPool(prepared, { lock = lockFor(goal, locks) })
  local pool, order, distinct, locked = bp.pool, bp.order, bp.distinct, bp.locked
  local pinsForGoal = (ctx.pins and ctx.pins[goal.id]) or {}
  for slot, itemId in pairs(pinsForGoal) do
    if pool[slot] then
      local kept = {}
      for _, v in ipairs(pool[slot]) do if v.itemId == tonumber(itemId) then kept[#kept + 1] = v end end
      if #kept > 0 then pool[slot] = kept end
    end
  end
  -- Encounter goals push the gate onto their reduced avoidance during SELECTION too (mirrors runner.js):
  -- the optimizer reaches for dodge/parry/block instead of settling for normal uncrushable.
  local oGates = goal.gates
  if enc then
    oGates = {}
    if goal.gates then for k, v in pairs(goal.gates) do oGates[k] = v end end
    oGates.enc = enc
  end
  local oGoal = { objective = "scale", scaleWeights = objScale, gates = oGates }
  for k, v in pairs(aggOpts) do oGoal[k] = v end
  local res = Optimizer.optimizeHeuristic(pool, order, oGoal, { distinct = distinct, locked = locked, seed = seed })

  local gateAware = false
  -- `keepAll` treats EVERY item as locked (kept as worn) — the baseline the monotonicity guard scores.
  local function gemSet(scaleOfFn, sel, uniqueOverrides, keepAll)
    sel = sel or res.selection
    local itemList = {}
    for _, slot in ipairs(order) do local v = sel[slot]; if v then itemList[#itemList + 1] = v end end
    local baseStatsList = {}
    for _, v in ipairs(itemList) do baseStatsList[#baseStatsList + 1] = { stats = baseOf(v) } end
    local gemOpts = gateAware and { gateScale = CAP_SCALE } or {}
    local plans = {}
    for _, v in ipairs(itemList) do
      if keepAll or v._gem == "locked" then
        plans[#plans + 1] = { v = v, scale = nil, locked = true, plan = { choices = {}, stats = lockedDelta(v, keepAll), metaCount = 0 } }
      else
        local sc = scaleOfFn(v)
        plans[#plans + 1] = { v = v, scale = sc, plan = GemSolver.planItemGems(v, sc, perks, maxPhase, gemOpts) }
      end
    end
    -- UNIQUE-GEM overrides (see src/runner.js): swap specific focus sockets to a one-per-character
    -- unique/epic gem, then recompute that item's gem stats (gems + socket bonus if still earned).
    if uniqueOverrides then
      for _, p in ipairs(plans) do
        local ov = (not p.locked) and uniqueOverrides[p.v.itemId] or nil
        if ov then
          for idx, U in pairs(ov) do
            local c = p.plan.choices[idx]
            if c then p.plan.choices[idx] = { socket = c.socket, name = U.name, id = U.id or nil, color = U.color, stats = U.stats } end
          end
          local s = {}
          for _, c in ipairs(p.plan.choices) do sumInto(s, c.stats or {}) end
          if p.v.socketBonus and GemSolver.bonusEarnedAsTagged(p.plan.choices) then
            sumInto(s, { [p.v.socketBonus.stat] = p.v.socketBonus.value })
          end
          p.plan.stats = s
        end
      end
    end
    local metas = resolveMetas(plans, objScale, ctx)
    local added = {}
    local gemChoices = {}
    for _, p in ipairs(plans) do
      sumInto(added, p.plan.stats)
      if p.locked then
        p.gems = currentGems(p.v)
        p.enchant = currentEnchant(p.v)
        p.socketBonus = nil
        p.bonusKept = nil
        for _, gg in ipairs(p.gems) do gemChoices[#gemChoices + 1] = gg end
      else
        local en = Enchants.bestEnchant(p.v.slot, p.scale, perks, { faction = faction, maxPhase = maxPhase })
        if en then sumInto(added, en.enchant.stats) end
        for _, ch in ipairs(p.plan.choices) do gemChoices[#gemChoices + 1] = ch end
        p.socketBonus = p.v.socketBonus or nil
        local coloredCh = {}
        for _, c in ipairs(p.plan.choices) do if c.color and FITS[c.color] then coloredCh[#coloredCh + 1] = c end end
        local earnedBefore = GemSolver.bonusEarnedAsTagged(p.plan.choices)
        p.bonusKept = (p.v.socketBonus and GemSolver.reassignForBonus(coloredCh, p.v.sockets)) and true or false
        if p.bonusKept and not earnedBefore then sumInto(added, { [p.v.socketBonus.stat] = p.v.socketBonus.value }) end
        p.gems = {}
        for _, c in ipairs(p.plan.choices) do p.gems[#p.gems + 1] = { name = c.name, id = c.id or nil, socket = c.socket or nil } end
        if en then p.enchant = { name = en.enchant.name, id = en.enchant.id or nil, spell = en.enchant.spell or nil, effectId = en.enchant.enchant or nil }
        else p.enchant = nil end
      end
    end
    for _, p in ipairs(plans) do
      if p.locked and p.metas then
        for _, m in ipairs(p.metas) do
          if not m.active then
            local mg = META_BY_NAME[m.name]
            if mg then sumInto(added, mg.stats, -1) end
          end
        end
      end
    end
    local aggInput = {}
    for _, b in ipairs(baseStatsList) do aggInput[#aggInput + 1] = b end
    aggInput[#aggInput + 1] = { stats = added }
    local agg = Model.aggregate(aggInput, aggOpts)
    return { plans = plans, metas = metas, added = added, gemChoices = gemChoices, agg = agg, evald = Evaluate.evaluateSet(agg), items = itemList, selection = sel }
  end

  local function finalLegal(e)
    local gt = goal.gates or {}
    local critOk
    if gt.raid == false then critOk = e.heroicCritImmune else critOk = e.raidCritImmune end
    local need = C.crushTargetFor(enc, gt.uncrushableTarget) -- SOLVER target (raw cap); cert uses certLegal
    local crushOk = (not gt.requireUncrushable) or (encAvoid(e, enc) + 1e-9 >= need)
    local hpOk = (not gt.minHealth) or ((e.health or 0) + 1e-9 >= gt.minHealth)
    return critOk and crushOk and hpOk
  end

  -- CERTIFICATION (mirrors src/runner.js certLegal): same gates but the crush check uses the safety-margined
  -- target so we never REPORT a set uncrushable that the in-game sheet would read as crushable. Used only for
  -- the returned `legal` flag + the Optimize card — never the solver loops (those aim at the raw cap).
  local function certLegal(e)
    local gt = goal.gates or {}
    local critOk
    if gt.raid == false then critOk = e.heroicCritImmune else critOk = e.raidCritImmune end
    local crushOk = (not gt.requireUncrushable) or (encAvoid(e, enc) + 1e-9 >= C.crushSafeTargetFor(enc, gt.uncrushableTarget))
    local hpOk = (not gt.minHealth) or ((e.health or 0) + 1e-9 >= gt.minHealth)
    return critOk and crushOk and hpOk
  end

  local scaleOf = {}
  for _, v in ipairs(res.items) do scaleOf[v] = (v._gem == "cap") and CAP_SCALE or objScale end
  local function scFn(v) return scaleOf[v] or objScale end
  local g = gemSet(function(v) return scaleOf[v] end)

  -- GATE RECOVERY
  if not finalLegal(g.evald) then
    gateAware = true
    local gg = gemSet(function(v) return scaleOf[v] end)
    local improved = finalLegal(gg.evald)
      or encAvoid(gg.evald, enc) > encAvoid(g.evald, enc)
      or gg.evald.critReduction > g.evald.critReduction
    if improved then g = gg else gateAware = false end
  end

  -- Goal-objective score of a gemmed set (buffed aggregate's raw stats — the exact metric the candidate
  -- ranking uses), to judge trades where one slot gains threat and another loses it.
  local function objScoreOf(gs) return Scoring.score(gs.agg._raw, objScale) end

  -- RECLAIM the gate overshoot
  if finalLegal(g.evald) then
    for _ = 1, #res.items do
      tick()
      local best = nil
      for _, v in ipairs(res.items) do
        if scaleOf[v] == CAP_SCALE then
          local trial = gemSet(function(x) if x == v then return objScale else return scaleOf[x] end end)
          if finalLegal(trial.evald) then
            local gain = trial.agg.spellPower - g.agg.spellPower
            if not best or gain > best.gain then best = { v = v, trial = trial, gain = gain } end
          end
        end
      end
      if not best then break end
      scaleOf[best.v] = objScale
      g = best.trial
    end
  end

  -- PAIRWISE RELOCATION (mirrors src/runner.js). A single flip above can be blocked because a def piece
  -- is load-bearing for a thin gate margin (e.g. a leg's +8 defense gem holding crit immunity), leaving
  -- a high-threat slot def-gemmed while the set sits over the crush cap. Try 2-opt moves: flip a def
  -- piece TO threat AND a threat piece TO def, relocating the gate stat where threat is worth less. Keep
  -- the pair only if it stays legal AND raises the goal objective; repeat until none improves.
  if finalLegal(g.evald) then
    for _ = 1, #res.items do
      tick()
      local curObj = objScoreOf(g)
      local best = nil
      for _, d in ipairs(res.items) do
        if scaleOf[d] == CAP_SCALE then
          for _, t in ipairs(res.items) do
            if t ~= d and t._gem ~= "locked" and scaleOf[t] ~= CAP_SCALE then
              local trial = gemSet(function(x)
                if x == d then return objScale elseif x == t then return CAP_SCALE else return scaleOf[x] end
              end)
              if finalLegal(trial.evald) then
                local o = objScoreOf(trial)
                if o > curObj + 1e-6 and (not best or o > best.o) then best = { d = d, t = t, trial = trial, o = o } end
              end
            end
          end
        end
      end
      if not best then break end
      scaleOf[best.d] = objScale
      scaleOf[best.t] = CAP_SCALE
      g = best.trial
    end
  end

  -- Near-identical alternatives for a slot (display).
  local function nearAlternatives(slotKey, chosen)
    if not chosen then return {} end
    local chosenScore = Scoring.score(chosen.stats, objScale)
    local denom = math.max(math.abs(res.objectiveValue or 0), 1)
    local slotScale = scaleOf[chosen] or objScale
    local byId, byIdOrder = {}, {}
    for _, v in ipairs(pool[slotKey] or {}) do
      if v.itemId ~= chosen.itemId then
        local sc = Scoring.score(v.stats, objScale)
        local cur = byId[v.itemId]
        if not cur then byId[v.itemId] = { v = v, sc = sc }; byIdOrder[#byIdOrder + 1] = v.itemId
        elseif sc > cur.sc then byId[v.itemId] = { v = v, sc = sc } end
      end
    end
    local alts = {}
    for ai, id in ipairs(byIdOrder) do
      local v, sc = byId[id].v, byId[id].sc
      if math.abs(sc - chosenScore) / denom <= ALT_EPS then
        local trialSel = {}
        for k, vv in pairs(res.selection) do trialSel[k] = vv end
        trialSel[slotKey] = v
        if Optimizer.distinctOk(trialSel, distinct) then
          local trialItems = {}
          for _, slot in ipairs(order) do local x = trialSel[slot]; if x then trialItems[#trialItems + 1] = x end end
          local dropInLegal = finalLegal(Evaluate.evaluateSet(Model.aggregate(trialItems, aggOpts)))
          local plan = GemSolver.planItemGems(v, slotScale, perks, maxPhase, {})
          local coloredCh = {}
          for _, c in ipairs(plan.choices) do if c.color and FITS[c.color] then coloredCh[#coloredCh + 1] = c end end
          local bonusKept = (v.socketBonus and GemSolver.reassignForBonus(coloredCh, v.sockets)) and true or false
          local gems = {}
          for _, c in ipairs(plan.choices) do gems[#gems + 1] = { name = c.name, id = c.id or nil, socket = c.socket or nil } end
          alts[#alts + 1] = { itemId = v.itemId, name = v.name or nil, objDelta = (sc - chosenScore) / denom, dropInLegal = dropInLegal, gems = gems, socketBonus = v.socketBonus or nil, bonusKept = bonusKept, _idx = ai }
        end
      end
    end
    table.sort(alts, function(a, b) if a.objDelta ~= b.objDelta then return a.objDelta > b.objDelta end return a._idx < b._idx end)
    local out = {}
    for i = 1, math.min(ALT_MAX, #alts) do out[#out + 1] = alts[i]; alts[i]._idx = nil end
    return out
  end

  -- FINAL META PASS — repair a meta a threat swap dropped.
  local hasInactiveMeta = false
  for _, m in ipairs(g.metas) do if not m.active then hasInactiveMeta = true; break end end
  if hasInactiveMeta then
    local function objOf(gs)
      local t = {}
      for _, it in ipairs(gs.items) do sumInto(t, baseOf(it)) end
      sumInto(t, gs.added)
      return Scoring.score(t, objScale)
    end
    local best = nil
    local curObj = objOf(g)
    for _, slotKey in ipairs(order) do
      tick()
      local cur = res.selection[slotKey]
      if cur and cur._gem ~= "locked" and not locked[slotKey] then
        local seen = { [cur.itemId] = true }
        for _, cand in ipairs(pool[slotKey]) do
          if not seen[cand.itemId] then
            seen[cand.itemId] = true
            local trialSel = {}
            for k, v in pairs(res.selection) do trialSel[k] = v end
            trialSel[slotKey] = cand
            if Optimizer.distinctOk(trialSel, distinct) then
              local trial = gemSet(scFn, trialSel)
              local anyInactive = false
              for _, m in ipairs(trial.metas) do if not m.active then anyInactive = true; break end end
              if not anyInactive and finalLegal(trial.evald) then
                local o = objOf(trial)
                if o > (best and best.o or curObj) then best = { trial = trial, o = o, slotKey = slotKey, cand = cand } end
              end
            end
          end
        end
      end
    end
    if best then
      res.selection[best.slotKey] = best.cand
      res.items = {}
      for _, slot in ipairs(order) do local it = res.selection[slot]; if it then res.items[#res.items + 1] = it end end
      g = best.trial
    end
  end

  -- UNIQUE-GEM PLACEMENT (mirrors src/runner.js). The bulk picker uses only repeatable cuts, so a
  -- unique/epic gem (one per character) is excluded there; but the player can slot ONE of each, and the
  -- best (e.g. Runed Ornate Ruby) is a real upgrade. Greedily place each unique in the focus socket that
  -- most raises the objective, re-gemming per trial (bonuses + metas recompute), kept only if legal AND
  -- the objective strictly rises. Each unique used once, each socket once. Monotonic.
  do
    local phase = maxPhase or CURRENT_PHASE
    local uniques = {}
    for _, u in ipairs(GEMS) do
      if (u.unique or u.epic) and u.phase <= phase and ((not u.jcOnly) or perks.jcGems) then
        uniques[#uniques + 1] = { u = u, s = Scoring.score(u.stats, objScale), i = #uniques + 1 }
      end
    end
    table.sort(uniques, function(a, b) if a.s ~= b.s then return a.s > b.s end return a.i < b.i end)
    local overrides = {}   -- itemId -> { idx -> gem }
    local usedSocket = {}  -- ["itemId:idx"] = true
    for _, uu in ipairs(uniques) do
      local U, us = uu.u, uu.s
      tick()
      local best = nil
      local curObj = objScoreOf(g)
      for _, p in ipairs(g.plans) do
        if not p.locked and p.v._gem ~= "cap" then
          for i = 1, #p.plan.choices do
            local c = p.plan.choices[i]
            local key = p.v.itemId .. ":" .. i
            if c.color and not usedSocket[key] and us > Scoring.score(c.stats or {}, objScale) then
              local trialOv = {}
              for iid, m in pairs(overrides) do local mm = {}; for k, v in pairs(m) do mm[k] = v end; trialOv[iid] = mm end
              trialOv[p.v.itemId] = trialOv[p.v.itemId] or {}
              trialOv[p.v.itemId][i] = U
              local trial = gemSet(scFn, res.selection, trialOv)
              if finalLegal(trial.evald) then
                local o = objScoreOf(trial)
                if o > curObj + 1e-6 and (not best or o > best.o) then
                  best = { itemId = p.v.itemId, idx = i, trial = trial, o = o }
                end
              end
            end
          end
        end
      end
      if best then
        overrides[best.itemId] = overrides[best.itemId] or {}
        overrides[best.itemId][best.idx] = U
        usedSocket[best.itemId .. ":" .. best.idx] = true
        g = best.trial
      end
    end
  end

  -- MONOTONICITY GUARD. Re-gemming must never hand back a set WEAKER than the gems already sitting in
  -- the gear. The per-socket picker is greedy and its socket-bonus / meta-color interactions are only
  -- locally optimal, so on a well-gemmed character it can land below the as-worn configuration. Every
  -- currently-socketed gem is by definition attainable — it's already in the item — so keeping them is
  -- always a legal candidate: score it and take it when it wins. Skipped in keep mode (g already IS it).
  if not ctx.keep then
    local keepG = gemSet(scFn, res.selection, nil, true)
    if finalLegal(keepG.evald) and objScoreOf(keepG) > objScoreOf(g) then g = keepG end
  end

  local plans, metas, added, gemChoices, agg, evald = g.plans, g.metas, g.added, g.gemChoices, g.agg, g.evald

  local buffImpact = nil
  if buff and (buff.kings or buff.buffs) then
    local baseStats = {}
    for _, v in ipairs(res.items) do baseStats[#baseStats + 1] = { stats = baseOf(v) } end
    baseStats[#baseStats + 1] = { stats = added }
    local uOpts = { hsBlockBonus = HS }
    if talents then uOpts.talents = talents end
    local aggU = Model.aggregate(baseStats, uOpts)
    local eU = Evaluate.evaluateSet(aggU)
    buffImpact = {
      name = ctx.buffName,
      stamina = agg.stamina - aggU.stamina,
      agility = agg.agility - aggU.agility,
      intellect = agg.intellect - aggU.intellect,
      strength = agg.strength - aggU.strength,
      armor = agg.armor - aggU.armor,
      health = agg.health - aggU.health,
      crushAvoid = evald.totalAvoidanceWithHS - eU.totalAvoidanceWithHS,
      critReduction = evald.critReduction - eU.critReduction,
    }
  end

  local perSlot = {}
  for _, slotKey in ipairs(order) do
    local it = res.selection[slotKey]
    if it then
      local p = nil
      for _, x in ipairs(plans) do if x.v == it then p = x; break end end
      if p then
        perSlot[slotKey] = { gems = p.gems, enchant = p.enchant, metas = p.metas, defGemmed = it._gem == "cap", locked = it._gem == "locked", socketBonus = p.socketBonus or nil, bonusKept = p.bonusKept }
      else
        perSlot[slotKey] = { gems = {}, enchant = nil, metas = {}, defGemmed = false, locked = false, socketBonus = nil, bonusKept = nil }
      end
      perSlot[slotKey].alternatives = nearAlternatives(slotKey, it)
    end
  end

  -- Effects valued as EQUIVALENT spell damage (a libram's Consecration damage; a proc trinket's buff
  -- averaged over its measured uptime) are NOT on the character sheet, so they're split out of the
  -- displayed number — see src/runner.js for the full reasoning. The objective still uses the full agg.
  -- Procs is referenced LAZILY here, the same way Items.build does it: a top-level `local Procs =
  -- ns.engine.Procs` captures nil for any caller that loads Runner without it (the parity harnesses
  -- did exactly that), and silently drops the proc's contribution instead of failing.
  local Procs = ns.engine.Procs
  local spellPowerEquiv, equivSources = 0, {}
  for _, v in ipairs(res.items) do
    local lib = Librams.libramStats(v)
    if lib and lib.spellDamage then
      spellPowerEquiv = spellPowerEquiv + lib.spellDamage
      equivSources[#equivSources + 1] = v.name or "relic effect"
    end
    local proc = Procs and Procs.procStats(v)
    if proc and proc.spellDamage then
      spellPowerEquiv = spellPowerEquiv + proc.spellDamage
      equivSources[#equivSources + 1] = v.name or "trinket proc"
    end
  end
  agg.spellPowerEquiv = spellPowerEquiv
  agg.spellPowerEquivSource = (#equivSources > 0) and table.concat(equivSources, " + ") or nil
  agg.spellPowerLiteral = math.max(0, (agg.spellPower or 0) - spellPowerEquiv)
  return { goal = goal, selection = res.selection, items = res.items, legal = certLegal(evald), evald = evald, agg = agg, gemChoices = gemChoices, metas = metas, perSlot = perSlot, buffImpact = buffImpact }
end
Runner.runGoal = runGoal

-- Stat-buff modes (Kings +10% primaries and MotW +14 flat stack in-game).
local BUFF_MODE = {
  raid = { opts = { kings = true, buffs = BUFFS.markOfTheWild }, name = "Kings + Mark of the Wild" },
  kings = { opts = { kings = true }, name = "Blessing of Kings" },
  motw = { opts = { buffs = BUFFS.markOfTheWild }, name = "Mark of the Wild" },
  none = { opts = {}, name = "" },
}

-- Main entry. items = the owned/equippable item pool. options mirror runner.js:optimizeSets.
function Runner.optimizeSets(items, options)
  options = options or {}
  local mode = BUFF_MODE[options.buff]
  if not mode then mode = options.buffed and BUFF_MODE.raid or BUFF_MODE.none end
  local scr = Scrolls.scrollStats(options.scrolls or {})
  local mergedBuffs = {}
  if mode.opts.buffs then for k, v in pairs(mode.opts.buffs) do mergedBuffs[k] = v end end
  for k, v in pairs(scr.buffs) do mergedBuffs[k] = (mergedBuffs[k] or 0) + v end
  local buff = {}
  if mode.opts.kings then buff.kings = mode.opts.kings end
  if next(mergedBuffs) ~= nil then buff.buffs = mergedBuffs end
  if scr.flatArmor and scr.flatArmor ~= 0 then buff.flatArmor = scr.flatArmor end

  local keep = keepConfig(options.keepGemsEnchants)
  local ctx = {
    perks = Professions.professionPerks(options.professions or {}),
    buff = buff,
    buffName = mode.name,
    pins = options.pins or {},
    maxPhase = options.maxPhase,
    encounter = options.encounter or nil, -- "illidan" | "sunwell" | nil (see encAvoid/encUncrush)
    faction = options.faction or nil,
    metaExclude = (options.useImbuedMeta == false) and { "Imbued Unstable Diamond" } or {},
    talents = (options.talentRanks and next(options.talentRanks) ~= nil) and Model.talentsFromRanks(options.talentRanks) or nil,
    locks = options.trinketLocks or Runner.DEFAULT_TRINKET_LOCKS,
    keep = keep and keep.pred or nil,
    keepIgnoreCompleteness = (keep and keep.ignoreCompleteness) or false,
  }
  if options.exclude and #options.exclude > 0 then
    local ex = {}
    for _, id in ipairs(options.exclude) do ex[id] = true end
    local filtered = {}
    for _, it in ipairs(items) do if not ex[it.itemId] then filtered[#filtered + 1] = it end end
    items = filtered
  end
  local goals = options.goals or Runner.GOAL_PRESETS

  -- The as-worn set, solved as its own single-candidate pool so it runs the SAME evaluation path as
  -- any other answer — kept exactly as equipped, never re-gemmed. Memoized per goal; nil when nothing
  -- is flagged equipped.
  local wornItems = {}
  for _, it in ipairs(items) do if it.equipped then wornItems[#wornItems + 1] = it end end
  local wornSeed = equippedSeed(items)
  local wornCache = {}
  local function wornSet(g)
    if #wornItems == 0 then return nil end
    if wornCache[g] ~= nil then
      local c = wornCache[g]
      if c == false then return nil end
      return c
    end
    local wctx = {}
    for k, v in pairs(ctx) do wctx[k] = v end
    wctx.keep = function() return true end
    wctx.keepIgnoreCompleteness = true
    local ok, out = pcall(runGoal, g, wornItems, wctx, {}) -- a partial worn set must never break the solve
    wornCache[g] = ok and out or false
    return ok and out or nil
  end

  -- `useCtx` lets the as-is floor reuse this whole path (gate-recovery sweep included) under a
  -- keep-mode ctx: an encounter goal's as-worn answer often needs that sweep to clear its harder
  -- avoidance gate, and a floor computed by the plain solve would come back illegal and be skipped.
  local asIsSeed -- forward declaration (defined below; solveGoalRaw and asIsSet call each other)
  local function solveGoalRaw(g, gseed, useCtx, certGate)
    useCtx = useCtx or ctx
    gseed = gseed or {}
    -- Seed from the EQUIPPED set when the caller gave no seed — or better, in re-gem mode, from the
    -- AS-IS answer for this goal (the best set reachable without touching a gem, already computed for
    -- the floor). The heuristic is greedy, so where it starts decides where it lands. useCtx.keep is
    -- set exactly when THIS call is the as-is solve, which is what stops the two from recursing.
    if next(gseed) == nil then gseed = (not useCtx.keep and asIsSeed(g)) or wornSeed end
    local r = runGoal(g, items, useCtx, gseed)
    local floor = (g.gates and g.gates.minHealth) or 0
    local crushReq = (not g.gates) or (g.gates.requireUncrushable ~= false)
    local enc = g.enc or useCtx.encounter or nil
    local floorMet = (floor == 0) or (r.agg.health + 1e-9 >= floor)
    -- Default: trigger on the RAW crush cap (the SOLVER's gate, crushTargetFor). certGate raises the
    -- trigger to the margined CERTIFICATION target (crushSafeTargetFor), so a set stuck in the ratings-vs-
    -- sheet dead zone (raw cap cleared but not cap+margin — e.g. 102.54 vs a 102.70 cert) ALSO triggers the
    -- sweep. certGate is used only by solveGoal's last-resort call, which fires when no legal set was found
    -- any other way, so a currently-legal answer is never perturbed. The candidate filter below (c.legal) is
    -- always the margined cert, so the swept set is certifiable regardless of certGate. (Mirrors src/runner.js.)
    local crushMet
    if not crushReq then
      crushMet = true
    elseif certGate then
      crushMet = encAvoid(r.evald, enc) + 1e-9 >= C.crushSafeTargetFor(enc, g.gates and g.gates.uncrushableTarget)
    else
      crushMet = encUncrush(r.evald, enc)
    end
    if floorMet and crushMet then return r end
    local maxHpGoal = {}
    for k, v in pairs(g) do maxHpGoal[k] = v end
    maxHpGoal.ratio = { sta = 1 }
    local mhGates = {}
    if g.gates then for k, v in pairs(g.gates) do mhGates[k] = v end end
    mhGates.minHealth = 0
    maxHpGoal.gates = mhGates
    local maxHp = runGoal(maxHpGoal, items, useCtx)
    if floor ~= 0 and maxHp.agg.health + 1e-9 < floor then
      if maxHp.agg.health > r.agg.health then
        local out = {}
        for k, v in pairs(maxHp) do out[k] = v end
        out.goal = g; out.legal = false; out.hpBestEffort = true
        return out
      end
      return r
    end
    local seed = {}
    for slot, it in pairs(maxHp.selection) do if it then seed[slot] = it.itemId end end
    local recSeed = (next(gseed) ~= nil) and gseed or seed
    local objScale = Scoring.blendScale(g.ratio)
    local leans = { g.ratio, { ehp = 1, threat = 1 }, { ehp = 1.5, threat = 1 }, { ehp = 2, threat = 1 }, { ehp = 3, threat = 1 } }
    local cands = {}
    local function consider(c) if c.legal and (floor == 0 or c.agg.health + 1e-9 >= floor) then cands[#cands + 1] = c end end
    consider(maxHp)
    for _, rt in ipairs(leans) do
      local lg = {}
      for k, v in pairs(g) do lg[k] = v end
      lg.ratio = rt
      consider(runGoal(lg, items, useCtx, recSeed))
    end
    if #cands == 0 then return r end
    local best = cands[1]
    for i = 2, #cands do
      if Scoring.score(cands[i].agg._raw, objScale) > Scoring.score(best.agg._raw, objScale) then best = cands[i] end
    end
    local out = {}
    for k, v in pairs(best) do out[k] = v end
    out.goal = g
    out.legal = best.legal and (floor == 0 or best.agg.health + 1e-9 >= floor)
    return out
  end

  -- The same pool solved with EVERY item's gems/enchants kept as worn — the floor "re-gem everything"
  -- must clear (see solveGoal). Memoized per goal; nil in keep mode, where the main solve IS this set.
  local asIsCache = {}
  local function asIsSet(g)
    if ctx.keep then return nil end
    if asIsCache[g] ~= nil then
      local c = asIsCache[g]
      if c == false then return nil end
      return c
    end
    local kctx = {}
    for k, v in pairs(ctx) do kctx[k] = v end
    kctx.keep = function() return true end
    kctx.keepIgnoreCompleteness = true
    local ok, out = pcall(solveGoalRaw, g, {}, kctx) -- the floor is an optimization, never a failure mode
    asIsCache[g] = ok and out or false
    return ok and out or nil
  end
  -- The as-is answer's per-slot picks, as a seed map (nil when there is no as-is set, so the caller
  -- falls back to the equipped seed). Assigned to the forward-declared local above.
  asIsSeed = function(g)
    local a = asIsSet(g)
    if not a then return nil end
    local sd, any = {}, false
    for slot, it in pairs(a.selection) do if it then sd[slot] = it.itemId; any = true end end
    return any and sd or nil
  end

  -- EQUIPPED FLOOR (mirrors runner.js). A recommendation scoring below the gear you already have is
  -- not a recommendation: return the worn set and flag it (`equippedIsBest`) instead of surfacing a
  -- sidegrade the player reads as an upgrade. Skipped when the worn set can't legally stand in —
  -- it fails this goal's gates, it violates trinket locks the player set, or the solved answer is
  -- itself illegal (a flagged near-miss is the honest output there).
  local function solveGoal(g, gseed)
    local r = solveGoalRaw(g, gseed)
    -- DEAD-ZONE RECOVERY (mirrors runner.js). The greedy solve can stall on a set whose ONLY failing gate
    -- is the crush CERTIFICATION margin (the raw 102.4 cap is cleared — encUncrush true — but not
    -- cap+margin, the ratings-vs-sheet band) even where the gear can reach a legal set. Re-solve with the
    -- recovery sweep raised to the cert target. Skipped when the raw cap itself is unmet (the default
    -- recovery already swept and found nothing) or when Min-HP is the blocker (hpBestEffort — genuinely
    -- unreachable, honestly flagged).
    -- RUNS BEFORE THE AS-IS FLOOR, and that order is the point: the floor below substitutes the as-worn
    -- set for ANY illegal answer, so with this after it a dead-zone stall was never repaired — it was
    -- silently swapped for the fully-kept set, which on a well-gemmed character made "re-gem everything"
    -- hand back all 17 pieces as worn. Guarded on `not r.legal`, so an already-legal solve is unperturbed.
    local lrEnc = g.enc or ctx.encounter or nil
    local lrCrushReq = (not g.gates) or (g.gates.requireUncrushable ~= false)
    if (not r.legal) and lrCrushReq and (not r.hpBestEffort) and encUncrush(r.evald, lrEnc) then
      local rec = solveGoalRaw(g, gseed, ctx, true)
      if rec.legal then r = rec end
    end
    -- AS-IS FLOOR (re-gem mode only, mirrors runner.js): keeping the gems already in the gear is
    -- attainable by definition, so re-gemming must never return LESS than the same solve with them
    -- kept. A legal set beats a flagged best-effort one; otherwise compare on the goal's objective.
    local asIs = asIsSet(g)
    if asIs and asIs.legal then
      local objScale = Scoring.blendScale(g.ratio)
      if (not r.legal)
          or Scoring.score(asIs.agg._raw, objScale) > Scoring.score(r.agg._raw, objScale) + 1e-9 then
        local out = {}
        for k, v in pairs(asIs) do out[k] = v end
        out.goal = g
        r = out
      end
    end
    local worn = wornSet(g)
    if not worn or not worn.legal or not r.legal then return r end
    if not equippedMeetsConstraints(items, g, ctx.locks, ctx.pins) then return r end
    local objScale = Scoring.blendScale(g.ratio)
    -- TIES GO TO THE GEAR YOU ARE WEARING: the solved answer must be STRICTLY better to displace it.
    if Scoring.score(worn.agg._raw, objScale) + 1e-9 < Scoring.score(r.agg._raw, objScale) then return r end
    local out = {}
    for k, v in pairs(worn) do out[k] = v end
    out.goal = g
    out.equippedIsBest = true
    return out
  end

  local function selSeed(rres)
    local s = {}
    for slot, it in pairs(rres.selection) do if it then s[slot] = it.itemId end end
    return s
  end
  local byId = {}
  local function sameGoal(g, id)
    local e = nil
    for _, x in ipairs(goals) do if x.id == id then e = x; break end end
    if not e or not byId[id] then return false end
    local a, b = g.ratio or {}, e.ratio or {}
    local function eq(x, y) return math.abs((x or 0) - (y or 0)) < 1e-9 end
    return eq(a.ehp, b.ehp) and eq(a.threat, b.threat) and eq(a.aoeThreat, b.aoeThreat)
      and (((g.gates and g.gates.minHealth) or 0) == ((e.gates and e.gates.minHealth) or 0))
  end

  local results = {}
  for _, g in ipairs(goals) do
    tick()
    local gseed = (options.seeds and options.seeds[g.id]) or {}
    local res
    local endId = nil
    if g.id == "balanced" then
      if sameGoal(g, "raid") then endId = "raid"
      elseif sameGoal(g, "survival") then endId = "survival" end
    end
    if endId then
      res = {}
      for k, v in pairs(byId[endId]) do res[k] = v end
      res.goal = g
    else
      res = solveGoal(g, gseed)
      if g.id == "balanced" and next(gseed) ~= nil then
        local function endThr(id) local e = nil; for _, x in ipairs(goals) do if x.id == id then e = x; break end end return (e and e.ratio and e.ratio.threat) or 0 end
        local mid = (endThr("raid") + endThr("survival")) / 2
        local nearer = byId[((g.ratio.threat or 0) >= mid) and "raid" or "survival"]
        if nearer then
          local alt = solveGoal(g, selSeed(nearer))
          local sc = Scoring.blendScale(g.ratio)
          if Scoring.score(alt.agg._raw, sc) > Scoring.score(res.agg._raw, sc) then res = alt end
        end
      end
    end
    byId[g.id] = res
    results[#results + 1] = res
    local pf = ns.engine.onProgress
    if pf then pf(#results, #goals) end
  end
  return results
end

return Runner

-- GemSolver — Lua port of src/gemsolver.js: recommend the ideal gems + enchants for a goal, with
-- per-item socket-bonus worth-it matching. This is the gem/enchant half of the in-game optimizer's
-- planning. Depends on Gems/Enchants (picks), Scoring (score), Model/Evaluate (the at-cap switch).
-- Parity-checked against gemsolver.js by test/lua/solver_parity.lua.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local Gems = ns.engine.Gems
local Enchants = ns.engine.Enchants
local Scoring = ns.engine.Scoring
local Model = ns.engine.Model
local Evaluate = ns.engine.Evaluate
local STAT_KEYS = ns.engine.CharacterData.STAT_KEYS
local FITS = Gems.FITS

local GemSolver = {}
ns.engine.GemSolver = GemSolver

-- Socket-count stat key -> color, in the fixed order recommendGems iterates (matches JS object order).
local SOCKET_COLORS = { { "socketRed", "red" }, { "socketYellow", "yellow" }, { "socketBlue", "blue" } }

-- Socket-bonus stats that feed the hard GATES (uncrushable / crit immunity). A bonus made of these is
-- load-bearing for legality below the cap, so its worth-it test is priced on the cap scale, not threat.
GemSolver.GATE_STATS = {
  defenseRating = true, dodgeRating = true, parryRating = true,
  blockRating = true, resilienceRating = true, agility = true,
}
local GATE_STATS = GemSolver.GATE_STATS

-- Cap-aware weight selection: once the set is already uncrushable, drop the crush-removal premium and
-- score gems face-value (atCapWeights). Mirrors gemsolver.js:gemWeights.
function GemSolver.gemWeights(weights, opts)
  opts = opts or {}
  if opts.atCapWeights and opts.uncrushable then return opts.atCapWeights end
  return weights
end

local function addStats(into, stats, mult)
  mult = mult or 1
  for k, v in pairs(stats or {}) do into[k] = (into[k] or 0) + v * mult end
end

local function listInclude(list, val)
  for _, x in ipairs(list) do if x == val then return true end end
  return false
end

-- Merge a picked gem's fields under a socket tag ({ socket = color, <gem fields> }).
local function gemChoice(socket, gem)
  local c = { socket = socket }
  for k, v in pairs(gem) do c[k] = v end
  return c
end

-- Tally the colors of the chosen (non-meta) gems for meta-activation checks.
local function colorCounts(choices)
  local counts = { red = 0, yellow = 0, blue = 0 }
  for _, c in ipairs(choices) do
    for _, col in ipairs(Gems.gemColors(c)) do
      if counts[col] ~= nil then counts[col] = counts[col] + 1 end
    end
  end
  return counts
end

-- Max-fit gem->socket assignment (Kuhn's bipartite matching, sockets are <=4). RELABELS each gem's
-- `.socket` to where it should physically go and returns whether every socket ends up matched (the
-- bonus is earned). Mirrors gemsolver.js:reassignForBonus. `sockets` = { red=n, yellow=n, blue=n }.
function GemSolver.reassignForBonus(choices, sockets)
  sockets = sockets or {}
  local S = {}
  for _, color in ipairs({ "red", "yellow", "blue" }) do
    for _ = 1, (sockets[color] or 0) do S[#S + 1] = color end
  end
  if #S == 0 or #choices == 0 then return false end
  local fits = {}
  for gi, c in ipairs(choices) do fits[gi] = Gems.gemColors(c) end
  local gemOfSocket = {}
  for si = 1, #S do gemOfSocket[si] = 0 end
  local socketOfGem = {}
  for gi = 1, #choices do socketOfGem[gi] = 0 end
  local function augment(gi, seen)
    for si = 1, #S do
      if not seen[si] and listInclude(fits[gi], S[si]) then
        seen[si] = true
        if gemOfSocket[si] == 0 or augment(gemOfSocket[si], seen) then
          gemOfSocket[si] = gi
          socketOfGem[gi] = si
          return true
        end
      end
    end
    return false
  end
  local matched = 0
  for gi = 1, #choices do
    local seen = {}
    for si = 1, #S do seen[si] = false end
    if augment(gi, seen) then matched = matched + 1 end
  end
  local freeSockets = {}
  for si = 1, #S do if gemOfSocket[si] == 0 then freeSockets[#freeSockets + 1] = si end end
  local f = 1
  for gi = 1, #choices do
    local si
    if socketOfGem[gi] ~= 0 then si = socketOfGem[gi] else si = freeSockets[f]; f = f + 1 end
    if si ~= nil then choices[gi].socket = S[si] end
  end
  return matched == #S
end

-- Do the item's colored gems, as tagged, already sit in fitting sockets? Mirrors gemsolver.js.
function GemSolver.bonusEarnedAsTagged(choices)
  local colored, allFit = 0, true
  for _, c in ipairs(choices) do
    if c.color and FITS[c.color] then
      colored = colored + 1
      if not listInclude(FITS[c.color], c.socket) then allFit = false end
    end
  end
  return colored > 0 and allFit
end

-- Recommend gems for a socket-count block, e.g. { socketRed=1, socketYellow=1, socketBlue=1,
-- socketMeta=1 }. Mirrors gemsolver.js:recommendGems.
function GemSolver.recommendGems(socketCounts, weights, perks)
  socketCounts = socketCounts or {}
  perks = perks or {}
  local choices = {}
  local stats = {}
  for _, pair in ipairs(SOCKET_COLORS) do
    local key, color = pair[1], pair[2]
    local n = socketCounts[key] or 0
    if n > 0 then
      local pick = Gems.bestGem(weights, { socketColor = color, jewelcrafting = perks.jcGems and true or false })
      if pick then
        for _ = 1, n do choices[#choices + 1] = gemChoice(color, pick.gem) end
        addStats(stats, pick.gem.stats, n)
      end
    end
  end
  if socketCounts.socketMeta then
    local counts = colorCounts(choices)
    local m = Gems.bestMeta(weights, { counts = counts })
    if m then
      choices[#choices + 1] = gemChoice("meta", m.gem)
      addStats(stats, m.gem.stats)
    end
  end
  return { choices = choices, stats = stats }
end

-- Recommend an enchant per enchantable slot in `slots`. Ring enchants apply to BOTH rings, so a 'ring'
-- slot contributes its enchant stats twice. Mirrors gemsolver.js:recommendEnchants.
function GemSolver.recommendEnchants(slots, weights, perks, opts)
  slots = slots or {}
  perks = perks or { names = {} }
  local choices = {}
  local stats = {}
  for _, slot in ipairs(slots) do
    if Enchants.ENCHANTS[slot] then
      local pick = Enchants.bestEnchant(slot, weights, perks, opts)
      if pick then
        choices[slot] = pick.enchant
        addStats(stats, pick.enchant.stats, slot == "ring" and 2 or 1)
      end
    end
  end
  return { choices = choices, stats = stats }
end

-- An item's socket-color layout: prefer parsed `sockets`, else derive from socket-count stat keys.
local function itemSockets(item)
  if item.sockets then return item.sockets end
  local s = item.stats or {}
  local out = {}
  if s.socketRed then out.red = s.socketRed end
  if s.socketYellow then out.yellow = s.socketYellow end
  if s.socketBlue then out.blue = s.socketBlue end
  if s.socketMeta then out.meta = s.socketMeta end
  return out
end

-- Plan one item's gems: per item, decide whether matching its socket colors to earn the socket bonus
-- beats slotting the globally best gem in every socket. Returns { choices, stats, metaCount }. Stats are
-- relative to EMPTY sockets (combine with item.baseStats). Mirrors gemsolver.js:planItemGems.
function GemSolver.planItemGems(item, weights, perks, maxPhase, opts)
  perks = perks or {}
  opts = opts or {}
  local bonusStat = item.socketBonus and item.socketBonus.stat
  local dW = weights
  if opts.gateScale and bonusStat and GATE_STATS[bonusStat] then dW = opts.gateScale end
  local function gemOpts(extra)
    local o = { jewelcrafting = perks.jcGems and true or false }
    if maxPhase then o.maxPhase = maxPhase end
    if extra then for k, v in pairs(extra) do o[k] = v end end
    return o
  end
  local sockets = itemSockets(item)
  local colored = {}
  for _, color in ipairs({ "red", "yellow", "blue" }) do
    for _ = 1, (sockets[color] or 0) do colored[#colored + 1] = color end
  end
  local choices = {}
  local stats = {}

  if #colored > 0 then
    -- Option A — ignore the bonus: globally best gem in every socket.
    local raw = Gems.bestGem(dW, gemOpts())
    local scoreA = raw and raw.score * #colored or 0

    -- Option B — chase the bonus: best color-fitting gem per socket, then add the bonus.
    local optB = nil
    if item.socketBonus then
      local sB, feasible = 0, true
      local bChoices, bStats = {}, {}
      for _, color in ipairs(colored) do
        local pick = Gems.bestGem(dW, gemOpts({ socketColor = color, matchColor = true }))
        if not pick then feasible = false; break end
        sB = sB + pick.score
        bChoices[#bChoices + 1] = gemChoice(color, pick.gem)
        addStats(bStats, pick.gem.stats)
      end
      if feasible then
        local bonusStats = { [item.socketBonus.stat] = item.socketBonus.value }
        sB = sB + Scoring.score(bonusStats, dW)
        addStats(bStats, bonusStats)
        optB = { score = sB, choices = bChoices, stats = bStats }
      end
    end

    -- Take the bonus on a TIE (>=): if the color-fitting gems score the same as the globally best,
    -- matching costs nothing, so bank the free bonus rather than forfeit it.
    if optB and optB.score >= scoreA then
      for _, c in ipairs(optB.choices) do choices[#choices + 1] = c end
      addStats(stats, optB.stats)
    elseif raw then
      for _, color in ipairs(colored) do choices[#choices + 1] = gemChoice(color, raw.gem) end
      addStats(stats, raw.gem.stats, #colored)
    end
  end

  return { choices = choices, stats = stats, metaCount = sockets.meta or 0 }
end

-- Unique slot names in the set, preserving first-seen order.
local function uniqueSlots(set)
  local seen, out = {}, {}
  for _, it in ipairs(set) do
    if it.slot and not seen[it.slot] then seen[it.slot] = true; out[#out + 1] = it.slot end
  end
  return out
end

-- Full loadout recommendation: gems for each item's sockets (with per-item socket-bonus worth-it) +
-- enchants for its slots. `set` is the list of owned/equipped items. opts.atCapWeights swaps to the
-- face-value scale once the set is ALREADY uncrushable; opts.maxPhase caps gem/enchant content phase.
-- Mirrors gemsolver.js:solveLoadout.
function GemSolver.solveLoadout(set, weights, perks, opts)
  perks = perks or { names = {} }
  opts = opts or {}
  local w = weights
  if opts.atCapWeights then
    local evald = Evaluate.evaluateSet(Model.aggregate(set))
    w = GemSolver.gemWeights(weights, { atCapWeights = opts.atCapWeights, uncrushable = evald.uncrushable })
  end
  local maxPhase = opts.maxPhase
  local metaOpts = {}
  if maxPhase then metaOpts.maxPhase = maxPhase end

  local gemChoices = {}
  local gemStats = {}
  local metaSlots = 0
  for _, it in ipairs(set) do
    local plan = GemSolver.planItemGems(it, w, perks, maxPhase)
    for _, c in ipairs(plan.choices) do gemChoices[#gemChoices + 1] = c end
    addStats(gemStats, plan.stats)
    metaSlots = metaSlots + plan.metaCount
  end

  -- Meta gems last: pick the best meta the set's colored gems can ACTIVATE. If none can, still socket
  -- the best meta but flag it inactive and DON'T count its stats.
  local counts = colorCounts(gemChoices)
  local metas = {}
  for _ = 1, metaSlots do
    local active = true
    local m = Gems.bestMeta(w, { counts = counts, maxPhase = metaOpts.maxPhase })
    if not m then m = Gems.bestMeta(w, metaOpts); active = false end
    if m then
      gemChoices[#gemChoices + 1] = gemChoice("meta", m.gem)
      if active then addStats(gemStats, m.gem.stats) end
      metas[#metas + 1] = { name = m.gem.name, requires = m.gem.requires, active = active }
    end
  end

  local slots = uniqueSlots(set)
  local enchants = GemSolver.recommendEnchants(slots, w, perks, metaOpts)
  local added = {}
  for _, k in ipairs(STAT_KEYS) do
    local v = (gemStats[k] or 0) + (enchants.stats[k] or 0)
    if v ~= 0 then added[k] = v end
  end
  return { gems = { choices = gemChoices, stats = gemStats, metas = metas }, enchants = enchants, addedStats = added }
end

return GemSolver

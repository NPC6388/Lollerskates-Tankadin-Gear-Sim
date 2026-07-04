-- Gems — Lua port of the LOGIC in src/gems.js: pick the best gem/meta for a goal's weights and judge
-- meta activation from the set's gem colors. Data (the gem/meta pool + FITS) lives in engine/GemsData.lua.
-- Parity-checked against gems.js by test/lua/solver_parity.lua.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.GemsData
local Scoring = ns.engine.Scoring
local FITS, CURRENT_PHASE = D.FITS, D.CURRENT_PHASE

local Gems = {}
ns.engine.Gems = Gems
Gems.FITS = FITS
Gems.CURRENT_PHASE = CURRENT_PHASE

local function fitsInclude(color, socketColor)
  for _, c in ipairs(FITS[color] or {}) do if c == socketColor then return true end end
  return false
end

-- Best non-meta gem for a goal. opts: socketColor, matchColor, alsoFits, jewelcrafting, allowUnique,
-- maxPhase (default CURRENT_PHASE). Mirrors gems.js:bestGem — unique/epic gems are skipped for bulk
-- fill unless allowUnique; matchColor+socketColor restrict to color-fitting gems; alsoFits requires
-- fitting a SECOND color too (used to keep a bonus while recoloring for a meta).
function Gems.bestGem(weights, opts)
  opts = opts or {}
  local socketColor, matchColor, alsoFits = opts.socketColor, opts.matchColor, opts.alsoFits
  local jewelcrafting, allowUnique = opts.jewelcrafting, opts.allowUnique
  local maxPhase = opts.maxPhase or CURRENT_PHASE
  local best = nil
  for _, g in ipairs(D.GEMS) do
    local ok = true
    if g.phase > maxPhase then ok = false end
    if ok and g.jcOnly and not jewelcrafting then ok = false end
    if ok and (g.unique or g.epic) and not allowUnique then ok = false end
    if ok and matchColor and socketColor and not fitsInclude(g.color, socketColor) then ok = false end
    if ok and alsoFits and not fitsInclude(g.color, alsoFits) then ok = false end
    if ok then
      local s = Scoring.score(g.stats, weights)
      if not best or s > best.score then best = { gem = g, score = s } end
    end
  end
  return best
end

-- Colors a gem contributes toward META activation (a hybrid counts for BOTH of its colors).
function Gems.gemColors(gem)
  if FITS[gem.color] then return FITS[gem.color] end
  if gem.color then return { gem.color } end
  return {}
end

-- One activation clause: "N+ <color>" (a minimum count) or "more <A> than <B>". Unknown clauses are
-- treated as met (never silently drop a real meta). Mirrors gems.js:metaConditionHolds.
function Gems.metaConditionHolds(cond, counts)
  counts = counts or {}
  local c = { red = counts.red or 0, yellow = counts.yellow or 0, blue = counts.blue or 0 }
  local num, col = cond:match("(%d+)%+%s*(%a+)")
  if num and c[col] ~= nil then return c[col] >= tonumber(num) end
  local a, b = cond:match("more%s+(%a+)%s+than%s+(%a+)")
  if a and b and c[a] ~= nil and c[b] ~= nil then return c[a] > c[b] end
  return true
end

-- Does a meta's `requires` hold for the set's gem color counts {red,yellow,blue}? Comma-separated
-- clauses must ALL hold. Mirrors gems.js:metaActivated.
function Gems.metaActivated(meta, counts)
  local r = meta.requires
  if not r then return true end
  for cond in r:gmatch("[^,]+") do
    if not Gems.metaConditionHolds((cond:gsub("^%s*(.-)%s*$", "%1")), counts) then return false end
  end
  return true
end

-- Best meta for a goal. opts: maxPhase (default CURRENT_PHASE), counts (restrict to metas the colors
-- can ACTIVATE), exclude (a list of meta names to skip). Mirrors gems.js:bestMeta.
function Gems.bestMeta(weights, opts)
  opts = opts or {}
  local maxPhase = opts.maxPhase or CURRENT_PHASE
  local counts, exclude = opts.counts, opts.exclude
  local best = nil
  for _, g in ipairs(D.META_GEMS) do
    local ok = true
    if g.phase > maxPhase then ok = false end
    if ok and exclude then
      for _, name in ipairs(exclude) do if name == g.name then ok = false; break end end
    end
    if ok and counts and not Gems.metaActivated(g, counts) then ok = false end
    if ok then
      local s = Scoring.score(g.stats, weights)
      if not best or s > best.score then best = { gem = g, score = s } end
    end
  end
  return best
end

return Gems

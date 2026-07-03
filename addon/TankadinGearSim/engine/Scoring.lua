-- Scoring — Lua port of src/scoring.js + src/weights.js:blendScale.
-- The optimizer ranks legal sets by score() (a dot product of a stat block against a weight scale)
-- once the hard caps are satisfied. Data (the scales) lives in engine/Weights.lua; this is the logic.
-- Parity-checked against the JS by test/lua/scoring_parity.lua.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local W = ns.engine.Weights

local Scoring = {}
ns.engine.Scoring = Scoring

-- score(stats, weights) = sum(stats[k] * weights[k]) over the weight's keys.
function Scoring.score(stats, weights)
  local total = 0
  for key, w in pairs(weights) do
    local v = stats[key]
    if type(v) == "number" then total = total + v * w end
  end
  return total
end

-- Score a stat block by named scale (W.SCALES).
function Scoring.scoreByScale(stats, scaleName)
  local w = W.SCALES[scaleName]
  assert(w, "Unknown scale: " .. tostring(scaleName))
  return Scoring.score(stats, w)
end

-- Per-stat contribution breakdown (for a future "why this piece" readout).
function Scoring.contributions(stats, weights)
  local out = {}
  for key, w in pairs(weights) do
    local v = stats[key]
    if type(v) == "number" and v ~= 0 and w ~= 0 then out[key] = v * w end
  end
  return out
end

-- Blend PARTS components into a full-keyed scale. `ratio` maps PART keys -> weight, e.g.
-- { threat = 2, sta = 1 }. Mirrors weights.js:blendScale — seeds from ZERO so every key is present,
-- then adds each component's sub-weights scaled by its ratio. (Order-independent: addition commutes,
-- so Lua's unordered pairs() is fine.)
function Scoring.blendScale(ratio)
  local out = {}
  for k, v in pairs(W.ZERO) do out[k] = v end
  for part, w in pairs(ratio or {}) do
    local m = W.PARTS[part]
    if m and w ~= 0 then
      for k, v in pairs(m) do out[k] = (out[k] or 0) + w * v end
    end
  end
  return out
end

return Scoring

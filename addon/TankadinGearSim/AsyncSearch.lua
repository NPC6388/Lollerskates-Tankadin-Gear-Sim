-- AsyncSearch (Phase D5c) — run the four-set optimizer across frames so a full solve never hitches the
-- client. Wraps the (synchronous, parity-tested) engine.Runner.optimizeSets in a coroutine and drives it
-- from an OnUpdate ticker with a per-frame time budget: the engine's cooperative-yield hook
-- (ns.engine.onTick, a no-op in the sync/parity path) yields once the frame's budget is spent, and the
-- ticker resumes next frame. Impure (CreateFrame / debugprofilestop), so it's compile-checked only — the
-- search RESULT it produces is identical to the sync path (which is what the parity harness proves).

local ADDON, ns = ...
local Async = {}
ns.Async = Async

local BUDGET_MS = 12 -- work this many ms per frame before yielding (leaves headroom in a 16.6ms frame)

-- Start an async optimize. Returns a handle with :cancel(). Callbacks (all optional):
--   onDone(results)        the array of goal results (same shape as Runner.optimizeSets)
--   onProgress(done,total) after each goal is solved
--   onError(message)       if the search errored (the run is aborted)
-- Only one run should be active at a time (they'd share the ns.engine.onTick hook); starting a new run
-- while one is active cancels nothing automatically, so callers should keep/cancel the handle.
function Async.optimizeSets(items, options, onDone, onProgress, onError)
  local Runner = ns.engine and ns.engine.Runner
  if not Runner then
    if onError then onError("engine.Runner not loaded") end
    return { cancel = function() end }
  end

  local co = coroutine.create(function() return Runner.optimizeSets(items, options) end)
  local driver = CreateFrame("Frame")
  local frameStart = 0
  local finished = false

  local function cleanup()
    finished = true
    ns.engine.onTick = nil
    ns.engine.onProgress = nil
    driver:SetScript("OnUpdate", nil)
    driver:Hide()
  end

  -- Yield once this frame's time budget is spent (called deep in the search at loop boundaries).
  ns.engine.onTick = function()
    if debugprofilestop() - frameStart >= BUDGET_MS then coroutine.yield() end
  end
  ns.engine.onProgress = function(done, total) if onProgress then onProgress(done, total) end end

  driver:SetScript("OnUpdate", function()
    if finished then return end
    frameStart = debugprofilestop()
    local ok, result = coroutine.resume(co)
    if not ok then
      cleanup()
      if onError then onError(tostring(result)) end
      return
    end
    if coroutine.status(co) == "dead" then
      cleanup()
      if onDone then onDone(result) end
    end
    -- else: yielded mid-search; the next OnUpdate resumes it.
  end)

  return {
    cancel = function() if not finished then cleanup() end end,
    isRunning = function() return not finished end,
  }
end

return Async

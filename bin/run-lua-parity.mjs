#!/usr/bin/env node
// Run the Lua parity harnesses locally WITHOUT a native Lua interpreter, using wasmoon (Lua in WASM).
// Handy on dev machines with no `lua` on PATH (Windows especially). CI still runs the authoritative
// check under real lua5.1 (.github/workflows/ci.yml) — wasmoon is Lua 5.4, close enough for the
// arithmetic parity these harnesses assert.
//
//   npm i -D wasmoon      # one-time (kept out of package.json so the repo stays dependency-free)
//   npm run test:lua:wasm
//
// It loads the real engine + harness .lua sources, shimming loadfile()/os.exit() so they run as-is.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(resolve(repo, p), 'utf8');

// Every .lua under the addon (for the compile/syntax pass — mirrors CI's `luac -p`).
function luaFilesUnder(dir) {
  const out = [];
  for (const e of readdirSync(resolve(repo, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...luaFilesUnder(rel));
    else if (e.name.endsWith('.lua')) out.push(rel);
  }
  return out;
}

let LuaFactory;
try {
  ({ LuaFactory } = await import('wasmoon'));
} catch {
  console.error('wasmoon not installed. Run:  npm i -D wasmoon   (then: npm run test:lua:wasm)');
  console.error('Or run the harnesses with a native Lua 5.1:  lua test/lua/eval_parity.lua');
  process.exit(2);
}

// Every source a harness may loadfile(), keyed by the exact path string it passes.
const PATHS = [
  'addon/TankadinGearSim/engine/Constants.lua',
  'addon/TankadinGearSim/engine/Combat.lua',
  'addon/TankadinGearSim/engine/Evaluate.lua',
  'addon/TankadinGearSim/engine/Weights.lua',
  'addon/TankadinGearSim/engine/Scoring.lua',
  'addon/TankadinGearSim/engine/CharacterData.lua',
  'addon/TankadinGearSim/engine/Model.lua',
  'test/lua/fixtures.lua',
  'test/lua/scoring_fixtures.lua',
  'test/lua/model_fixtures.lua',
];
const HARNESSES = ['test/lua/eval_parity.lua', 'test/lua/scoring_parity.lua', 'test/lua/model_parity.lua'];

let anyFail = false;

// --- Syntax pass: compile every addon .lua (WoW globals resolve at runtime, so load() validates
// syntax fine — catches errors in the WoW-facing files the parity harnesses never load). ---
{
  const lua = await new LuaFactory().createEngine();
  await lua.doString('function __compile(src, name) local f, e = load(src, name); if f then return "" else return e end end');
  const compile = lua.global.get('__compile');
  const files = luaFilesUnder('addon/TankadinGearSim');
  const bad = [];
  for (const f of files) {
    const err = compile(rd(f), '@' + f);
    if (err && err !== '') bad.push(`${f}: ${err}`);
  }
  lua.global.close();
  console.log(`=== syntax (luac-style) : ${bad.length ? 'FAIL' : 'PASS'}  (${files.length} files) ===`);
  if (bad.length) { anyFail = true; bad.forEach((b) => console.log('  ' + b)); }
  console.log('');
}
for (const h of HARNESSES) {
  const lua = await new LuaFactory().createEngine();
  const out = [];
  let exitCode = 0;
  lua.global.set('__print', (s) => out.push(String(s)));
  lua.global.set('__exit', (c) => { exitCode = Number(c) || 0; });

  const dispatch = [];
  PATHS.forEach((p, i) => {
    lua.global.set('SRC_' + i, rd(p));
    dispatch.push(`if path == ${JSON.stringify(p)} then return load(SRC_${i}, path) end`);
  });
  await lua.doString(`
    loadfile = function(path)
      ${dispatch.join('\n      ')}
      error("no injected file: " .. tostring(path))
    end
    print = function(...)
      local t = {}
      for i = 1, select('#', ...) do t[i] = tostring(select(i, ...)) end
      __print(table.concat(t, "\\t"))
    end
    os.exit = function(code) __exit(code or 0); error("__EXIT__") end
  `);

  try {
    await lua.doString(rd(h));
  } catch (e) {
    if (!String(e).includes('__EXIT__')) { out.push('LUA ERROR: ' + (e && e.message || e)); exitCode = 2; }
  }
  lua.global.close();
  if (exitCode !== 0) anyFail = true;
  console.log(`=== ${h}  ->  ${exitCode === 0 ? 'PASS' : 'FAIL'} ===`);
  console.log(out.join('\n') + '\n');
}
process.exit(anyFail ? 1 : 0);

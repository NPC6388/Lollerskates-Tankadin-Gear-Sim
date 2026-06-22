// Parser for the TankadinGearSim addon export string.
// Format (newline-separated):
//   TGS<version>
//   C:key=val;key=val;...                 (character-sheet finals, for calibration)
//   I:item:<id>:<enchant>:<g1>:<g2>:<g3>:<g4>:<suffix>:...   (one per owned item)

// item string -> { itemId, enchantId, gems[], suffixId }
export function parseItemString(s) {
  const parts = s.split(':');
  const n = (i) => Number(parts[i]) || 0;
  return {
    itemString: s,
    itemId: n(1),
    enchantId: n(2),
    gems: [n(3), n(4), n(5), n(6)].filter((g) => g !== 0),
    suffixId: n(7),
  };
}

export function parseExport(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !/^TGS\d+$/.test(lines[0])) {
    throw new Error('Not a Tankadin Gear Sim export (missing TGS header)');
  }
  const out = { version: Number(lines[0].slice(3)), character: {}, items: [] };

  for (const line of lines.slice(1)) {
    if (line.startsWith('C:')) {
      for (const kv of line.slice(2).split(';')) {
        if (!kv) continue;
        const eq = kv.indexOf('=');
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        if (!k) continue;
        out.character[k] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
      }
    } else if (line.startsWith('I:')) {
      out.items.push(parseItemString(line.slice(2)));
    }
  }
  return out;
}

// Decode the `export` string out of a TankadinGearSim SavedVariables file (the TankadinGearSimDB
// Lua table the addon writes on /reload). Returns the plain TGS export text. Browser- and
// Node-safe: walks the Lua string literal honoring \n, \t, \", \\, and \ddd decimal escapes
// (WoW writes non-ASCII bytes as \ddd). The escape sequences are themselves ASCII, so this works
// whether the file was read as UTF-8 or latin1.

export function decodeSavedVariables(raw) {
  const marker = '["export"] = "';
  const start = raw.indexOf(marker);
  if (start < 0) throw new Error('No TankadinGearSimDB export found — is this the right SavedVariables file?');
  let i = start + marker.length;
  let s = '';
  while (i < raw.length) {
    const c = raw[i];
    if (c === '\\') {
      const n = raw[i + 1];
      if (n === 'n') { s += '\n'; i += 2; }
      else if (n === 't') { s += '\t'; i += 2; }
      else if (n === '"') { s += '"'; i += 2; }
      else if (n === '\\') { s += '\\'; i += 2; }
      else if (n >= '0' && n <= '9') {
        let d = ''; let j = i + 1;
        while (j < raw.length && d.length < 3 && raw[j] >= '0' && raw[j] <= '9') { d += raw[j]; j++; }
        s += String.fromCharCode(parseInt(d, 10)); i = j;
      } else { s += n; i += 2; }
    } else if (c === '"') { break; } // unescaped closing quote ends the string
    else { s += c; i += 1; }
  }
  return s;
}

// Is this text a SavedVariables Lua dump (vs a raw TGS paste)? Lets the UI auto-detect.
export function looksLikeSavedVariables(text) {
  return /TankadinGearSimDB\s*=|\["export"\]\s*=/.test(text);
}

// Accept either form: a SavedVariables dump (decode it) or a raw TGS export (use as-is).
export function toExportText(text) {
  return looksLikeSavedVariables(text) ? decodeSavedVariables(text) : text;
}

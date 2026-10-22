// scripts/lib/code-aliases.mjs - crr-01 alias rows for the derived code registry.
// One alias may resolve to exactly one canonical; anything else throws (fail-closed).
export function buildAliasRows(indexItems) {
  const rows = [];
  const aliasToCanon = new Map();
  for (const item of indexItems) {
    for (const alias of item.aliases || []) {
      const canonical = item.code;
      if (aliasToCanon.has(alias)) {
        if (aliasToCanon.get(alias) !== canonical) throw new Error("REFUSED alias " + alias + " resolves to two canonicals");
        continue;
      }
      aliasToCanon.set(alias, canonical);
      rows.push({ alias, canonical, status: "alias" });
    }
  }
  rows.sort((a, b) => a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0);
  return rows;
}
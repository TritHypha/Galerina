// String intern table — maps string value → i32 ID (opaque handle)
//
// The host registers interned strings with the WASM instance at load time.
// The WASM guest uses the ID (i32) everywhere as an opaque string handle.
// 0 is reserved for the empty string "".

const _stringTable = new Map<string, number>();
let _nextStringId = 1; // 0 reserved for ""

/**
 * Interns a string literal value and returns its i32 ID.
 * Strips surrounding quotes if present. Returns 0 for the empty string.
 */
export function internString(value: string): number {
  if (value === "" || value === '""') return 0;
  // Strip surrounding double-quotes if present
  const stripped = value.startsWith('"') && value.endsWith('"') && value.length >= 2
    ? value.slice(1, -1) : value;
  if (stripped === "") return 0;
  const existing = _stringTable.get(stripped);
  if (existing !== undefined) return existing;
  const id = _nextStringId++;
  _stringTable.set(stripped, id);
  return id;
}

/**
 * Renders the current string intern table as WAT comment lines.
 * The host reconstructs this mapping to register strings at WASM load time.
 */
export function renderStringTableComments(): string {
  const lines: string[] = [";; String intern table (for host reconstruction):", ";; 0 = \"\""];
  for (const [str, id] of _stringTable) {
    lines.push(`;; ${id} = "${str}"`);
  }
  return lines.join("\n");
}

/**
 * Resets the string intern table. Call before emitting a new module to avoid
 * IDs leaking across compilation units.
 */
export function resetStringTable(): void {
  _stringTable.clear();
  _nextStringId = 1;
}

/**
 * #145: expose the current string-intern table as handle → literal value, so a host
 * runtime can SEED its string registry at the exact i32 handles the emitted WASM uses
 * (handle 0 is always ""). Call AFTER the module is rendered (the table is populated
 * during emission). The host then registers any runtime input string at the next free
 * handle (≥ maxHandle+1) to avoid colliding with a literal.
 */
export function getInternedStrings(): Array<{ handle: number; value: string }> {
  const out: Array<{ handle: number; value: string }> = [{ handle: 0, value: "" }];
  for (const [str, id] of _stringTable) out.push({ handle: id, value: str });
  return out;
}

const DEFINITION = /^\s*pub const ([A-Z][A-Z0-9_]*): RuntimeErrorCode\s*=\s*RuntimeErrorCode\s*\{([\s\S]*?)^\s*\};/gm;

function field(body, name) {
  return body.match(new RegExp(`^\\s*${name}:\\s*"([^"]*)"\\s*,?\\s*$`, "m"))?.[1];
}

/** Parse only explicit Rust RuntimeErrorCode constants, not arbitrary strings. */
export function parseRustRuntimeErrorDefinitions(source) {
  const definitions = [];
  for (const match of source.matchAll(DEFINITION)) {
    const body = match[2];
    definitions.push({
      constant: match[1],
      code: field(body, "code"),
      name: field(body, "name"),
      severity: field(body, "severity"),
      message: field(body, "message"),
      line: source.slice(0, match.index).split("\n").length,
      endLine: source.slice(0, match.index + match[0].length).split("\n").length,
    });
  }
  return definitions;
}

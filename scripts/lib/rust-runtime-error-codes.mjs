const DEFINITION = /^[\t ]*pub const ([A-Z][A-Z0-9_]*): RuntimeErrorCode\s*=\s*RuntimeErrorCode\s*\{/gm;

// Position-preserving lexical masks: comments are absent from metadata, and
// literals are additionally absent when locating declarations and code blocks.
export function rustLexicalMasks(source) {
  const comments = source.split("");
  const code = source.split("");
  function mask(start, end, comment) {
    for (let p = start; p < end; p++) {
      if (source[p] === "\n" || source[p] === "\r") continue;
      code[p] = " ";
      if (comment) comments[p] = " ";
    }
  }
  for (let i = 0; i < source.length;) {
    const start = i;
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
      mask(start, i, true);
    } else if (source.startsWith("/*", i)) {
      i += 2;
      let depth = 1;
      while (i < source.length && depth) {
        if (source.startsWith("/*", i)) { depth++; i += 2; }
        else if (source.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error("Unterminated Rust block comment");
      mask(start, i, true);
    } else {
      const raw = source.slice(i).match(/^(?:br|cr|r)(#*)"/);
      if (raw) {
        const close = '"' + raw[1];
        const end = source.indexOf(close, i + raw[0].length);
        if (end < 0) throw new Error("Unterminated Rust raw string");
        i = end + close.length;
        mask(start, i, false);
      } else if (source[i] === '"') {
        i++;
        while (i < source.length && source[i] !== '"') {
          i += source[i] === "\\" ? 2 : 1;
        }
        if (i >= source.length) throw new Error("Unterminated Rust string");
        i++;
        mask(start, i, false);
      } else if (source[i] === "'") {
        // A lifetime such as 'static is not a character literal.
        const char = source.slice(i).match(/^'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|[^\r\n])|[^'\\\r\n])'/u);
        if (char) { i += char[0].length; mask(start, i, false); }
        else i++;
      } else i++;
    }
  }
  return { comments: comments.join(""), code: code.join("") };
}

function field(body, codeBody, name) {
  const positions = [...codeBody.matchAll(new RegExp(`^[\\t ]*${name}:`, "gm"))];
  if (positions.length !== 1) return undefined;
  const match = positions[0];
  // Bounded metadata grammar: one plain, unescaped string literal per field.
  // Unsupported values stay undefined so the audit refuses, never guesses.
  return body.slice(match.index + match[0].length)
    .match(/^[\t ]*"([^"\\\r\n]*)"[\t ]*,?[\t ]*(?:\r?\n|$)/)?.[1];
}

/** Parse only explicit Rust RuntimeErrorCode constants, not arbitrary strings. */
export function parseRustRuntimeErrorDefinitions(source) {
  const definitions = [];
  const masks = rustLexicalMasks(source);
  for (const match of masks.code.matchAll(DEFINITION)) {
    const start = match.index + match[0].length;
    let end = start;
    let depth = 1;
    while (end < masks.code.length && depth > 0) {
      if (masks.code[end] === "{") depth++;
      if (masks.code[end] === "}") depth--;
      end++;
    }
    if (depth) throw new Error(`Unterminated Rust runtime metadata: ${match[1]}`);
    const body = masks.comments.slice(start, end - 1);
    const codeBody = masks.code.slice(start, end - 1);
    definitions.push({
      constant: match[1],
      code: field(body, codeBody, "code"),
      name: field(body, codeBody, "name"),
      severity: field(body, codeBody, "severity"),
      message: field(body, codeBody, "message"),
      line: source.slice(0, match.index).split("\n").length,
      endLine: source.slice(0, end).split("\n").length,
    });
  }
  return definitions;
}

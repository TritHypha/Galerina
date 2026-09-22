import type { JsonDiagnostic, JsonMemoryPolicy } from "./index.js";

export const JSON_VALUE_SCHEMA = "fungi.json.value.v1";

export type JsonTaint = "clean" | "tainted";

export interface JsonValueField {
  readonly name: string;
  readonly value: JsonValue;
}

export type JsonValue =
  | { readonly kind: "null"; readonly taint: JsonTaint }
  | { readonly kind: "bool"; readonly value: boolean; readonly taint: JsonTaint }
  | { readonly kind: "string"; readonly value: string; readonly taint: JsonTaint }
  | { readonly kind: "int"; readonly value: number; readonly taint: JsonTaint }
  | { readonly kind: "array"; readonly items: readonly JsonValue[]; readonly taint: JsonTaint }
  | { readonly kind: "object"; readonly fields: readonly JsonValueField[]; readonly taint: JsonTaint };

export type JsonValueResult =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly diagnostic: JsonDiagnostic };

export type JsonEncodeResult =
  | { readonly ok: true; readonly text: string; readonly taint: JsonTaint }
  | { readonly ok: false; readonly diagnostic: JsonDiagnostic };

export interface JsonValueParseOptions {
  readonly memory: JsonMemoryPolicy;
  readonly taint?: JsonTaint;
}

export const FUNGI_JSON_INVALID_TOKEN = "FUNGI-JSON-001";
export const FUNGI_JSON_BOUND = "FUNGI-JSON-002";
export const FUNGI_JSON_DUPLICATE_KEY = "FUNGI-JSON-003";
export const FUNGI_JSON_NUMBER_NOT_INT = "FUNGI-JSON-004";
export const FUNGI_JSON_ENCODE_REFUSED = "FUNGI-JSON-005";
export const FUNGI_JSON_MEMORY_POLICY = "FUNGI-JSON-006";
export const FUNGI_JSON_TRAILING = "FUNGI-JSON-007";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function diagnostic(
  code: string,
  message: string,
  path?: string,
): JsonDiagnostic {
  return {
    code,
    severity: "error",
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function err(code: string, message: string, path?: string): JsonValueResult {
  return { ok: false, diagnostic: diagnostic(code, message, path) };
}

function encodeErr(code: string, message: string, path?: string): JsonEncodeResult {
  return { ok: false, diagnostic: diagnostic(code, message, path) };
}

export function joinJsonTaint(left: JsonTaint, right: JsonTaint): JsonTaint {
  return left === "tainted" || right === "tainted" ? "tainted" : "clean";
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function memoryDiagnostics(memory: JsonMemoryPolicy | undefined): JsonDiagnostic[] {
  if (memory === undefined) {
    return [diagnostic(
      FUNGI_JSON_MEMORY_POLICY,
      "JSON value parse requires a bounded memory policy.",
      "memory",
    )];
  }
  const diagnostics: JsonDiagnostic[] = [];
  if (!isPositiveSafeInteger(memory.maxDepth)) {
    diagnostics.push(diagnostic(
      FUNGI_JSON_MEMORY_POLICY,
      "JSON memory policy requires a positive integer maxDepth.",
      "memory.maxDepth",
    ));
  }
  if (!isPositiveSafeInteger(memory.maxDocumentBytes)) {
    diagnostics.push(diagnostic(
      FUNGI_JSON_MEMORY_POLICY,
      "JSON memory policy requires a positive integer maxDocumentBytes.",
      "memory.maxDocumentBytes",
    ));
  }
  if (memory.maxStringBytes !== undefined && !isPositiveSafeInteger(memory.maxStringBytes)) {
    diagnostics.push(diagnostic(
      FUNGI_JSON_MEMORY_POLICY,
      "JSON memory policy maxStringBytes, when set, must be a positive integer.",
      "memory.maxStringBytes",
    ));
  }
  return diagnostics;
}

class ParseFailure {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly path: string,
  ) {}
}

class Scanner {
  index = 0;
  nodes = 0;

  constructor(
    readonly source: string,
    readonly memory: JsonMemoryPolicy,
    readonly taint: JsonTaint,
  ) {}

  parse(): JsonValue {
    this.skipWs();
    if (this.index >= this.source.length) {
      throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON value source is empty.", "");
    }
    const value = this.parseValue(1, "");
    this.skipWs();
    if (this.index !== this.source.length) {
      throw new ParseFailure(FUNGI_JSON_TRAILING, "JSON value has trailing tokens.", "");
    }
    return value;
  }

  private parseValue(depth: number, path: string): JsonValue {
    if (depth > this.memory.maxDepth) {
      throw new ParseFailure(FUNGI_JSON_BOUND, "JSON value exceeds maxDepth.", path);
    }
    this.nodes += 1;
    if (this.nodes > this.memory.maxDocumentBytes) {
      throw new ParseFailure(FUNGI_JSON_BOUND, "JSON value exceeds node budget.", path);
    }
    this.skipWs();
    const ch = this.source[this.index];
    if (ch === "n") return this.parseLiteral("null", { kind: "null", taint: this.taint }, path);
    if (ch === "t") return this.parseLiteral("true", { kind: "bool", value: true, taint: this.taint }, path);
    if (ch === "f") return this.parseLiteral("false", { kind: "bool", value: false, taint: this.taint }, path);
    if (ch === '"') return { kind: "string", value: this.parseString(path), taint: this.taint };
    if (ch === "-") return this.parseNumber(path);
    if (ch !== undefined && ch >= "0" && ch <= "9") return this.parseNumber(path);
    if (ch === "[") return this.parseArray(depth, path);
    if (ch === "{") return this.parseObject(depth, path);
    throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON value has an invalid token.", path);
  }

  private parseLiteral(token: string, value: JsonValue, path: string): JsonValue {
    if (this.source.slice(this.index, this.index + token.length) !== token) {
      throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, `JSON value expected ${token}.`, path);
    }
    this.index += token.length;
    return value;
  }

  private parseString(path: string): string {
    this.index += 1;
    let out = "";
    while (this.index < this.source.length) {
      const ch = this.source[this.index];
      if (ch === '"') {
        this.index += 1;
        const bytes = encoder.encode(out).byteLength;
        const maxString = this.memory.maxStringBytes;
        if (maxString !== undefined && bytes > maxString) {
          throw new ParseFailure(FUNGI_JSON_BOUND, "JSON string exceeds maxStringBytes.", path);
        }
        return out;
      }
      if (ch === "\\") {
        this.index += 1;
        const escaped = this.source[this.index];
        this.index += 1;
        if (escaped === '"') out += '"';
        else if (escaped === "\\") out += "\\";
        else if (escaped === "/") out += "/";
        else if (escaped === "b") out += "\b";
        else if (escaped === "f") out += "\f";
        else if (escaped === "n") out += "\n";
        else if (escaped === "r") out += "\r";
        else if (escaped === "t") out += "\t";
        else if (escaped === "u") {
          const hex = this.source.slice(this.index, this.index + 4);
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) {
            throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON string has an invalid unicode escape.", path);
          }
          out += String.fromCharCode(Number.parseInt(hex, 16));
          this.index += 4;
        } else {
          throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON string has an invalid escape.", path);
        }
        continue;
      }
      if (ch === undefined || ch.charCodeAt(0) < 0x20) {
        throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON string contains a control character.", path);
      }
      out += ch;
      this.index += 1;
    }
    throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON string is truncated.", path);
  }

  private parseNumber(path: string): JsonValue {
    const start = this.index;
    if (this.source[this.index] === "-") this.index += 1;
    const first = this.source[this.index];
    if (first === undefined || first < "0" || first > "9") {
      throw new ParseFailure(FUNGI_JSON_NUMBER_NOT_INT, "JSON number is not an exact integer.", path);
    }
    if (first === "0") {
      this.index += 1;
      const next = this.source[this.index];
      if (next !== undefined && next >= "0" && next <= "9") {
        throw new ParseFailure(FUNGI_JSON_NUMBER_NOT_INT, "JSON number has a leading zero.", path);
      }
    } else {
      while (this.index < this.source.length) {
        const digit = this.source[this.index];
        if (digit === undefined || digit < "0" || digit > "9") break;
        this.index += 1;
      }
    }
    const next = this.source[this.index];
    if (next === "." || next === "e" || next === "E") {
      throw new ParseFailure(
        FUNGI_JSON_NUMBER_NOT_INT,
        "JSON number must be an exact integer; fractions and exponents are refused.",
        path,
      );
    }
    const token = this.source.slice(start, this.index);
    if (token === "-0") {
      throw new ParseFailure(FUNGI_JSON_NUMBER_NOT_INT, "JSON number -0 is refused.", path);
    }
    const value = Number(token);
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new ParseFailure(FUNGI_JSON_NUMBER_NOT_INT, "JSON number is not a safe integer.", path);
    }
    return { kind: "int", value, taint: this.taint };
  }

  private parseArray(depth: number, path: string): JsonValue {
    this.index += 1;
    this.skipWs();
    const items: JsonValue[] = [];
    if (this.source[this.index] === "]") {
      this.index += 1;
      return { kind: "array", items: Object.freeze(items), taint: this.taint };
    }
    while (true) {
      const itemPath = path === "" ? `/${items.length}` : `${path}/${items.length}`;
      items.push(this.parseValue(depth + 1, itemPath));
      this.skipWs();
      const sep = this.source[this.index];
      if (sep === "]") {
        this.index += 1;
        return { kind: "array", items: Object.freeze(items), taint: this.taint };
      }
      if (sep !== ",") {
        throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON array is malformed.", path);
      }
      this.index += 1;
    }
  }

  private parseObject(depth: number, path: string): JsonValue {
    this.index += 1;
    this.skipWs();
    const fields: JsonValueField[] = [];
    const seen = new Set<string>();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return { kind: "object", fields: Object.freeze(fields), taint: this.taint };
    }
    while (true) {
      this.skipWs();
      if (this.source[this.index] !== '"') {
        throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON object key must be a string.", path);
      }
      const name = this.parseString(path);
      if (seen.has(name)) {
        throw new ParseFailure(FUNGI_JSON_DUPLICATE_KEY, `JSON object has duplicate key "${name}".`, path);
      }
      seen.add(name);
      this.skipWs();
      if (this.source[this.index] !== ":") {
        throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON object is missing a colon.", path);
      }
      this.index += 1;
      const childPath = path === "" ? `/${name}` : `${path}/${name}`;
      const value = this.parseValue(depth + 1, childPath);
      fields.push({ name, value });
      this.skipWs();
      const sep = this.source[this.index];
      if (sep === "}") {
        this.index += 1;
        return { kind: "object", fields: Object.freeze(fields), taint: this.taint };
      }
      if (sep !== ",") {
        throw new ParseFailure(FUNGI_JSON_INVALID_TOKEN, "JSON object is malformed.", path);
      }
      this.index += 1;
    }
  }

  private skipWs(): void {
    while (this.index < this.source.length) {
      const ch = this.source[this.index];
      if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") return;
      this.index += 1;
    }
  }
}

function sourceText(
  source: string | Uint8Array,
): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly diagnostic: JsonDiagnostic } {
  if (typeof source === "string") return { ok: true, text: source };
  try {
    return { ok: true, text: decoder.decode(source) };
  } catch {
    return {
      ok: false,
      diagnostic: diagnostic(FUNGI_JSON_INVALID_TOKEN, "JSON value source is not valid UTF-8."),
    };
  }
}

export function parseJsonValue(
  source: string | Uint8Array,
  options: JsonValueParseOptions,
): JsonValueResult {
  const memoryErrors = memoryDiagnostics(options.memory);
  if (memoryErrors[0] !== undefined) {
    return { ok: false, diagnostic: memoryErrors[0] };
  }
  const maxBytes = options.memory.maxDocumentBytes;
  if (typeof source !== "string") {
    if (source.byteLength > maxBytes) {
      return err(FUNGI_JSON_BOUND, "JSON value exceeds maxDocumentBytes.");
    }
  } else if (source.length > maxBytes) {
    return err(FUNGI_JSON_BOUND, "JSON value exceeds maxDocumentBytes.");
  }
  const decoded = sourceText(source);
  if (!decoded.ok) return decoded;
  const text = decoded.text;
  if (text.charCodeAt(0) === 0xFEFF) {
    return err(FUNGI_JSON_INVALID_TOKEN, "JSON value source must not start with a UTF-8 BOM.");
  }
  const bytes = typeof source === "string" ? encoder.encode(text).byteLength : source.byteLength;
  if (bytes > maxBytes) {
    return err(FUNGI_JSON_BOUND, "JSON value exceeds maxDocumentBytes.");
  }
  const taint: JsonTaint = options.taint === "tainted" ? "tainted" : "clean";
  try {
    return { ok: true, value: new Scanner(text, options.memory, taint).parse() };
  } catch (caught) {
    if (caught instanceof ParseFailure) {
      return err(caught.code, caught.message, caught.path === "" ? undefined : caught.path);
    }
    return err(FUNGI_JSON_INVALID_TOKEN, "JSON value parse failed closed.");
  }
}

function encodeString(value: string): string {
  let out = "\"";
  for (const unit of value) {
    const code = unit.charCodeAt(0);
    if (unit === "\"") out += "\\\"";
    else if (unit === "\\") out += "\\\\";
    else if (unit === "\b") out += "\\b";
    else if (unit === "\f") out += "\\f";
    else if (unit === "\n") out += "\\n";
    else if (unit === "\r") out += "\\r";
    else if (unit === "\t") out += "\\t";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += unit;
  }
  return `${out}"`;
}

const MAX_ENCODE_DEPTH = 64;
const MAX_ENCODE_BYTES = 1_048_576;
const MAX_ENCODE_NODES = 100_000;

function encodeNode(
  value: JsonValue,
  path: string,
  depth: number,
  budget: { remaining: number; nodes: number },
): { text: string; taint: JsonTaint } | JsonEncodeResult {
  if (depth > MAX_ENCODE_DEPTH) {
    return encodeErr(FUNGI_JSON_ENCODE_REFUSED, "JSON encode nesting exceeds the host bound.", path);
  }
  budget.nodes += 1;
  if (budget.nodes > MAX_ENCODE_NODES) {
    return encodeErr(FUNGI_JSON_ENCODE_REFUSED, "JSON encode node count exceeds the host bound.", path);
  }
  switch (value.kind) {
    case "null":
      return { text: "null", taint: value.taint };
    case "bool":
      return { text: value.value ? "true" : "false", taint: value.taint };
    case "string":
      return { text: encodeString(value.value), taint: value.taint };
    case "int": {
      if (!Number.isSafeInteger(value.value) || Object.is(value.value, -0)) {
        return encodeErr(FUNGI_JSON_NUMBER_NOT_INT, "JSON int is not a safe integer.", path);
      }
      return { text: String(value.value), taint: value.taint };
    }
    case "array": {
      const parts: string[] = [];
      let taint = value.taint;
      for (const [index, item] of value.items.entries()) {
        const childPath = path === "" ? `/${index}` : `${path}/${index}`;
        const encoded = encodeNode(item, childPath, depth + 1, budget);
        if ("ok" in encoded) return encoded;
        parts.push(encoded.text);
        taint = joinJsonTaint(taint, encoded.taint);
      }
      return { text: `[${parts.join(",")}]`, taint };
    }
    case "object": {
      const seen = new Set<string>();
      const parts: string[] = [];
      let taint = value.taint;
      for (const field of value.fields) {
        if (seen.has(field.name)) {
          return encodeErr(FUNGI_JSON_DUPLICATE_KEY, `JSON object has duplicate key "${field.name}".`, path);
        }
        seen.add(field.name);
        const childPath = path === "" ? `/${field.name}` : `${path}/${field.name}`;
        const encoded = encodeNode(field.value, childPath, depth + 1, budget);
        if ("ok" in encoded) return encoded;
        parts.push(`${encodeString(field.name)}:${encoded.text}`);
        taint = joinJsonTaint(taint, encoded.taint);
      }
      return { text: `{${parts.join(",")}}`, taint };
    }
    default:
      return encodeErr(FUNGI_JSON_ENCODE_REFUSED, "JSON value kind is not in the closed set.", path);
  }
}

export function encodeJsonValue(value: JsonValue): JsonEncodeResult {
  const budget = { remaining: MAX_ENCODE_BYTES, nodes: 0 };
  const encoded = encodeNode(value, "", 1, budget);
  if ("ok" in encoded) return encoded;
  if (encoded.text.length > MAX_ENCODE_BYTES) {
    return encodeErr(FUNGI_JSON_ENCODE_REFUSED, "JSON encode output exceeds the host bound.", "");
  }
  return { ok: true, text: encoded.text, taint: encoded.taint };
}

export const Json = Object.freeze({
  parse: parseJsonValue,
  encode: encodeJsonValue,
});

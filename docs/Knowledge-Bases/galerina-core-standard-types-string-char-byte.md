# Galerina Standard Types: String, Char, Byte

**Status:** Draft standard-library design note  
**Scope:** `String`, `Char`, `Byte`, `Bytes`, `SecureString` — safe use in Galerina source, compiler contracts, runtime checks, and reports.  
**Source:** NOTES TO COVER / b.txt (2026-05-26)  
**Related KB:** `arrays-and-string-operations.md`, `galerina-core-security-secret-reference-model.md`

---

## 1. Why These Types Exist

Galerina treats text and raw binary data as separate concepts.

```text
String             = trusted Unicode text value
Char               = one Unicode scalar value / character unit
Byte               = one raw 8-bit value (UInt8)
Bytes              = ordered raw binary data
SecureString       = secret text — redacted in all logs and reports
ReadOnlyView<Bytes> = non-mutating byte view — mutation requires clone()
```

Many security bugs come from mixing text, bytes, encodings, secrets, file contents, network packets, and user input without clear boundaries. Galerina makes those boundaries visible and compiler-enforced.

```galerina
// Good: text is text.
let name: String = "Ada"

// Good: a single text unit is a Char.
let initial: Char = 'A'

// Good: binary data is bytes, not String.
let marker: Byte = 0xFF
let payload: Bytes = Bytes.fromHex("89504E470D0A1A0A")
```

---

## 2. String

`String` is Galerina's standard text type — valid Unicode, immutable by default.

```galerina
let title: String = "Customer invoice"
let message: String = "Payment received"
```

### Rules

```text
String must be valid Unicode.
String is immutable by default.
String length must be explicit about what is being counted (chars vs encoded bytes).
String must not silently accept invalid byte sequences.
String must not be used for secrets — use SecureString instead.
```

### Standard Operations

```galerina
let text: String = "Galerina"

let chars: Int = text.charCount()               // count of Unicode scalar values
let bytes: Int = text.encodedLength(Encoding.UTF8)
let lower: String = text.toLower()
let upper: String = text.toUpper()
let starts: Bool = text.startsWith("Log")
let contains: Bool = text.contains("ic")
```

### Encoding Boundary

`String` becomes `Bytes` only through an explicit encoding step:

```galerina
let text: String = "hello"

// Explicit: text → bytes using UTF-8.
let encoded: Bytes = text.encode(Encoding.UTF8)
```

`Bytes` becomes `String` only through a checked decode that can fail:

```galerina
let raw: Bytes = request.body

// Decode can fail → returns Result.
let decoded: Result<String, DecodeError> = String.decode(raw, Encoding.UTF8)

map decoded {
  Ok(text) => log.info("Decoded body")
  Err(error) => return BadRequest("Invalid UTF-8 body")
}
```

### Security Use

Plain `String` is not safe for secrets:

```galerina
// Bad: secrets should not be normal strings.
let apiKey: String = env("API_KEY")

// Good: secret-aware wrapper.
let apiKey: SecureString = Secret.env("API_KEY")

// SecureString is redacted by default in all logs and reports.
log.info("Loaded API key", apiKey)  // output: "[REDACTED]"
```

### String.format — Named Interpolation (Phase 9A-3)

`String.format` supports both positional `{}` and named `{field}` interpolation.

```galerina
// Positional (original)
let msg: String = "Hello {}!".format("Alice")
// → "Hello Alice!"

// Named (Phase 9A-3) — pass a record with field names matching {placeholders}
let greeting: String = "Hello {name}, you have {count} messages.".format({
  name: "Bob",
  count: 3,
})
// → "Hello Bob, you have 3 messages."

// Named format also works via String.format(template, record) call form
let banner: String = format("Order {ref} total: {amount}", { ref: orderId, amount: total })
```

**Rule:** Named placeholders `{name}` are replaced by the matching record field. Positional `{}` are replaced in order.

### Compiler Diagnostics

| Code | Name | Description |
|---|---|---|
| `SPORE-STRING-001` | `INVALID_UTF8_DECODE` | Attempted decode produced invalid UTF-8 |
| `SPORE-STRING-002` | `SECRET_STORED_AS_STRING` | Secret value assigned to plain `String` |
| `SPORE-STRING-003` | `IMPLICIT_STRING_BYTE_CONVERSION` | `Bytes` assigned to `String` without explicit decode |
| `SPORE-STRING-004` | `AMBIGUOUS_STRING_LENGTH` | `.length` used without specifying chars vs bytes |

Example:

```galerina
let raw: Bytes = File.read("data.bin")
let text: String = raw
// ^ SPORE-STRING-003: Bytes cannot become String without explicit decode.
```

---

## 3. Char

`Char` represents one Unicode character unit. It is text — not a small integer.

```galerina
let letter: Char = 'A'
let symbol: Char = '£'
```

### Rules

```text
Char is text, not a Byte.
Char must be a valid Unicode scalar value.
Char-to-number conversion must be explicit (via .codePoint()).
Char-to-Byte conversion is only valid through encoding.
```

### Standard Operations

```galerina
let c: Char = 'A'

let isDigit: Bool = c.isDigit()
let isLetter: Bool = c.isLetter()
let isWhitespace: Bool = c.isWhitespace()
let codePoint: UInt32 = c.codePoint()
let asText: String = c.toString()
```

### Char and Byte Are Not Interchangeable

```galerina
let c: Char = 'A'
let b: Byte = 65

// Bad: Char is not Byte.
let wrong: Byte = c
// ^ SPORE-CHAR-001: Char cannot be assigned to Byte.

// Good: encode explicitly.
let encoded: Bytes = c.toString().encode(Encoding.UTF8)
```

### AST Support

`charLiteral` is an `AstNodeKind` in `@galerina/core` — single-quoted character literals parse to this node kind.

### Compiler Diagnostics

| Code | Name | Description |
|---|---|---|
| `SPORE-CHAR-001` | `CHAR_BYTE_CONFUSION` | `Char` assigned to or compared with `Byte` without conversion |
| `SPORE-CHAR-002` | `INVALID_CHAR_LITERAL` | Character literal contains an invalid Unicode scalar value |
| `SPORE-CHAR-003` | `MULTI_CHAR_LITERAL` | Character literal contains more than one character unit |
| `SPORE-CHAR-004` | `IMPLICIT_CHAR_NUMBER_CONVERSION` | `Char` used as integer without `.codePoint()` |

Example:

```galerina
let c: Char = 'AB'
// ^ SPORE-CHAR-003: Char literal must contain exactly one character unit.
```

---

## 4. Byte

`Byte` is Galerina's standard unsigned 8-bit raw value. Its primary purpose is binary data, not general arithmetic.

```galerina
let zero: Byte = 0x00
let max: Byte = 0xFF
```

### Rules

```text
Byte range is 0 to 255.
Byte overflow must be checked or explicit — no silent wrapping.
Byte must not be confused with Char.
Byte arrays represent raw data, not text.
```

### Standard Operations

```galerina
let b: Byte = 0x7F

let n: UInt8 = b.toUInt8()
let hex: String = b.toHex()
let highNibble: Byte = b.highNibble()
let lowNibble: Byte = b.lowNibble()
```

### AST Support

`byteLiteral` is an `AstNodeKind` in `@galerina/core` — hex or decimal byte literals (e.g. `0xFF`, `255`) parse to this node kind when the declared type is `Byte`.

### Bytes

`Bytes` is the standard collection for binary data:

```galerina
let fileData: Bytes = File.readBytes("image.png")
let packet: Bytes = Network.receiveBytes()

// Phase 9A-3: Bytes.sha256() — hash via node:crypto
let hashBytes: Bytes = fileData.sha256()
let hashHex: String = fileData.sha256Hex()       // convenience: SHA-256 as lowercase hex string
```

`Bytes` supports bounded read-only views and explicit mutation-by-clone:

```galerina
let body: Bytes = request.body

// Safe: no copy, read-only view.
let header: ReadOnlyView<Bytes> = body.slice(0, 32)

// Explicit: mutation requires clone.
let mutableCopy: Bytes = body.clone()
mutableCopy[0] = 0x00
```

### Security Use

Raw bytes are often sensitive. The security block governs their handling:

```galerina
let upload: Bytes = request.body

security {
  deny log.rawBytes
  require maxBodyMb 10
  require virusScan when upload.mimeType == MimeType.Unknown
}
```

### Compiler Diagnostics

| Code | Name | Description |
|---|---|---|
| `SPORE-BYTE-001` | `BYTE_OUT_OF_RANGE` | Byte literal value is outside 0–255 |
| `SPORE-BYTE-002` | `BYTE_OVERFLOW` | Byte arithmetic result exceeds 255 without explicit handling |
| `SPORE-BYTE-003` | `IMPLICIT_BYTE_STRING_CONVERSION` | `Bytes` assigned to `String` without explicit decode |
| `SPORE-BYTE-004` | `RAW_BYTES_LOGGED` | Raw `Bytes` value passed to a log sink without redaction |
| `SPORE-BYTE-005` | `UNBOUNDED_BYTES_READ` | `Bytes` read without a declared memory limit or streaming path |

Example:

```galerina
let b: Byte = 300
// ^ SPORE-BYTE-001: Byte value must be between 0 and 255.
```

---

## 5. Standard Type Summary

| Type | Meaning | Default safety rule |
|---|---|---|
| `String` | Valid Unicode text | No implicit byte conversion |
| `Char` | One Unicode character unit | Not interchangeable with `Byte` |
| `Byte` | One unsigned 8-bit value | Range checked, no silent overflow |
| `Bytes` | Raw binary data | Decode explicitly before text use |
| `SecureString` | Secret text | Redacted in all logs and reports |
| `ReadOnlyView<Bytes>` | Non-mutating byte view | Mutation requires `clone()` |

---

## 6. Compiler Enforcement Rules

```text
No implicit String ↔ Bytes conversion.
No implicit Char ↔ Byte conversion.
String.decode() returns Result<String, DecodeError> — must be handled with map.
Byte literals are range-checked at compile time.
Raw Bytes logging is denied or must be explicitly redacted.
Large Bytes reads require a declared memory limit or a streaming path.
```

---

## 7. Minimal Standard-Library Shape

```galerina
module std.text {
  type String
  type Char
  enum Encoding { UTF8, UTF16LE, UTF16BE, ASCII }
  type DecodeError
}

module std.bytes {
  type Byte = UInt8
  type Bytes
  type ReadOnlyView<T>
}

module std.security {
  type SecureString
}
```

---

## 8. AstNodeKind Additions (galerina-core/src/index.ts)

Two new node kinds were added to `AstNodeKind` in `@galerina/core` on 2026-05-26:

| Kind | Syntax | Example |
|---|---|---|
| `charLiteral` | Single-quoted single character | `'A'`, `'£'` |
| `byteLiteral` | Hex or decimal byte literal with `Byte` declared type | `0xFF`, `255` |

These sit alongside `stringLiteral`, `numberLiteral`, and `boolLiteral` in the leaf-node group.

---

## 9. Phase 1 Additions Checklist

```text
[ ] std.text module: String, Char, Encoding, DecodeError
[ ] std.bytes module: Byte, Bytes, ReadOnlyView<T>
[ ] std.security module: SecureString boundary rule
[x] SPORE-STRING-001..004 in compiler diagnostics (@galerina/core-compiler src/index.ts)
[x] SPORE-CHAR-001..004 in compiler diagnostics (@galerina/core-compiler src/index.ts)
[x] SPORE-BYTE-001..005 in compiler diagnostics (@galerina/core-compiler src/index.ts)
[x] charLiteral added to AstNodeKind (@galerina/core)
[x] byteLiteral added to AstNodeKind (@galerina/core)
```

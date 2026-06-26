# Bit Width And Base64 Asset Policy

## Purpose

Galerina should handle bit widths, numeric representation, binary compatibility,
base64 encoded assets, embedded images, runtime optimisation and security
boundaries while remaining:

```text
security-first
CPU-compatible
future photonic compatible
Tri/Neutral aware
AI-readable
runtime-safe
```

Core rule:

```text
Normal Galerina code should not need to think about bit size.
Low-level, binary, AI, network, image, crypto and interop boundaries must.
```

Bit-width handling should be:

```text
explicit at boundaries
passive in normal application logic
```

## Safe Default Numeric Types

Normal application code should prefer:

```text
Int
Nat
Decimal
Money
BigInt
Rational
```

These should:

```text
avoid silent overflow
avoid truncation
avoid signed/unsigned confusion
remain architecture-safe
```

The runtime/compiler may internally optimise representation automatically.

## Explicit Fixed-Width Types

Galerina should support fixed-width types for boundary work:

```text
UInt8
Int8
UInt16
Int16
UInt32
Int32
UInt64
Int64
Float32
Float64
```

These are required for:

```text
binary protocols
network packets
WASM interop
GPU kernels
AI tensors
image formats
audio formats
cryptography
hardware boundaries
database wire protocols
```

## No Silent Conversion

Galerina must deny unsafe numeric conversion.

Rejected pattern:

```galerina
let x: UInt8 = 300
```

Allowed pattern:

```galerina
let x = UInt8.tryFrom(300)
  -> Result<UInt8, NumericRangeError>
```

The runtime/compiler must never silently:

```text
truncate
wrap
overflow
reinterpret signedness
```

## Security Risks

Different bit sizes create security risks:

```text
integer overflow
truncation
signed/unsigned confusion
endianness confusion
unsafe casts
NaN abuse
timing attacks
precision loss
```

These risks should be visible at boundary contracts and report level.

## Runtime Optimisation

Galerina should optimise automatically where safe.

Possible optimisation areas:

```text
SIMD/vectorisation
packed arrays
zero-copy buffers
typed memory layouts
streaming decoders
GPU kernels
AI accelerator tensors
```

The runtime/compiler should infer efficient layouts without requiring
developers to manually tune ordinary application code.

## Passive Backend Representation

Galerina should support target-aware optimisation passively.

Example target package concepts:

```text
galerina-target-cpu
galerina-target-gpu
galerina-target-wasm
galerina-target-ai-accelerator
galerina-target-photonic
```

Example:

```galerina
Vector<UInt8, 1024>
```

may compile differently depending on:

```text
CPU SIMD
GPU
AI accelerator
future photonic backend
```

without changing application source code.

## Low-Bit AI Support

Low-bit formats are important for AI acceleration:

```text
Int8
UInt8
Float16
BFloat16
Int4
UInt4
Binary
Ternary
```

These should live in package layers such as:

```text
galerina-ai-lowbit
galerina-core-vector
galerina-core-compute
```

not in the normal application core model.

## Base64 And Embedded Assets

Base64 embedded content should be treated as:

```text
untrusted encoded asset data
```

not trusted application content.

Example:

```html
<img src="data:image/png;base64,..." />
```

## Runtime Flow For Base64 Assets

Before decoding base64 content, the runtime should:

```text
1. Run security phase
2. Detect data URI
3. Parse metadata only
4. Validate policy
5. Estimate decoded size
6. Decide handling mode
7. Report decision
```

The runtime should avoid full decode unless required.

## Security Phase Requirements

Before decoding base64 content, Galerina must validate:

```text
MIME type
encoded size
estimated decoded size
route policy
memory policy
asset policy
SVG/script policy
```

## Handling Modes

### Pass-Through Encoded

Fastest mode:

```text
base64 remains encoded
no image processing
minimal runtime cost
```

Allowed only for:

```text
small trusted assets
generated reports
safe internal assets
```

### Decode And Validate

Safer for uploads:

```text
stream decode
verify image signature
validate dimensions
strip metadata
re-encode safely
```

Recommended for:

```text
user uploads
CMS content
AI-generated content
emails
external HTML
```

### Externalise Asset

Best for performance:

```text
decode once
validate
store as external asset
replace data URI
```

Example:

```html
<img src="/assets/hash.webp" />
```

Benefits:

```text
browser caching
smaller HTML
reduced memory pressure
better streaming
```

## Dangerous Embedded Content

Galerina should deny by default:

```text
SVG scripts
PDF JavaScript
embedded executables
Office macros
external references
active PDF actions
HTML in metadata
```

## Parser Isolation And Reconstruction

Base64 and embedded assets may decode into dangerous parser inputs.

Preferred model:

```text
main runtime
  -> isolated parser worker
  -> strict memory limits
  -> no secrets
  -> no filesystem access
  -> no network access
```

Safe reconstruction should prefer:

```text
decode
validate
sanitize
re-encode
```

Examples:

```text
JPG -> clean WebP
PDF -> rebuilt safe PDF
SVG -> sanitized SVG
```

## Runtime Memory And Performance

Base64 content can cause:

```text
memory pressure
large HTML payloads
decode amplification
slow parsing
cache inefficiency
```

Base64 adds roughly:

```text
~33% size overhead
```

Galerina should prefer external assets for large files.

## Streaming By Default

Galerina should avoid large full-memory operations.

Avoid:

```text
loadEntireFile()
readAll()
huge buffer allocation
unbounded arrays
```

Prefer:

```text
streamed decoding
chunked parsing
bounded queues
incremental processing
```

## Runtime Security Rules

The following must never be bypassed:

```text
security phase
memory checks
size limits
asset policy
permission checks
audit logging
```

Optimisations may skip deep image analysis, AI processing, metadata extraction
or asset conversion only after security classification.

## Reports

Galerina should eventually emit:

```text
numeric-width-report.json
overflow-check-report.json
asset-security-report.json
base64-policy-report.json
parser-worker-report.json
runtime-memory-report.json
sanitization-report.json
```

Reports must be:

```text
secret-safe
machine-readable
AI-readable
audit-friendly
```

## Final Principle

Bit size should be passive for normal code, explicit for low-level boundaries,
checked for security and optimised automatically where safe.

Base64 and embedded assets are untrusted encoded data.

They may bypass deep processing, but must never bypass security classification,
memory policy or runtime safety controls.

# Galerina Safe Pattern Matching and Regex

Galerina, short for **Galerina**, should support fast regex-style processing, but the default design should be **safe pattern matching**, not traditional regex everywhere.

Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
patterns.spore
validators.spore
log-scanner.spore
```

Detailed syntax examples live in:

```text
docs/sytax/patterns-and-regex.md
```

---

## Summary

Regex is useful for validation, scanning and text extraction, but unsafe pattern engines can create ReDoS risks when a pattern takes too long to match.

Galerina should support two levels:

```text
Pattern     = safe, fast, default
UnsafeRegex = advanced, explicit, audited
```

Normal application code should use safe patterns:

```Galerina
let emailPattern: Pattern = pattern.compile("^[^@]+@[^@]+\\.[^@]+$")

pure flow isEmailLike(value: String) -> Bool {
  return pattern.matches(emailPattern, value)
}
```

For common cases, typed validators are preferred:

```Galerina
let email: Email = Email.parse(input.email)?
```

This keeps regex available without forcing developers to use it for common validation tasks.

---

## Design Basis

The safe default should follow bounded finite-automata style matching: avoid
features that require exponential backtracking, keep matching bounded, and make
memory use explicit.

RE2 documents linear-time matching for input length, configurable memory budgeting and unsupported backtracking-only constructs such as backreferences and look-around assertions. PCRE2 JIT is useful as an explicit advanced mode, but requires more careful limits and audit. Hyperscan shows the value of compiling groups of patterns into a database and supporting streaming scans with known memory requirements.

References:

```text
https://github.com/google/re2
https://www.pcre.org/current/doc/html/pcre2jit.html
https://intel.github.io/hyperscan/dev-reference/intro.html
```

---

# 1. Core Principle

```text
Galerina should make safe pattern matching easy and unsafe regex obvious.
Default regex must be fast, bounded and ReDoS-resistant.
Advanced regex should require explicit unsafe policy, limits and reporting.
```

---

# 2. Safe Default Pattern Engine

The default pattern engine should be:

```text
linear-time
bounded-memory
non-recursive where possible
safe for untrusted input
compiled and cached
source-mapped
reportable
```

The safe engine should deny or reject features that can require catastrophic backtracking.

Examples:

```text
backreferences
lookbehind
catastrophic backtracking constructs
engine-specific recursive patterns
```

---

# 3. Pattern Policy

Pattern policy should live in `boot.spore`.

```Galerina
pattern_policy {
  default_engine "safe"

  safe_regex {
    linear_time_required true
    max_pattern_length 500
    max_input_length 100kb
    max_memory 16mb
    timeout 20ms
    cache_compiled true
  }

  deny_features [
    "backreferences",
    "lookbehind",
    "catastrophic_backtracking"
  ]

  reports {
    pattern_report true
    security_report true
  }
}
```

Galerina may validate policy shape, report risky settings and apply compiler/runtime checks.

---

# 4. Pattern Type

`Pattern` is the safe default type.

```Galerina
readonly postcodePattern: Pattern = pattern.compile("^[A-Z]{1,2}[0-9][0-9A-Z]?\\s?[0-9][A-Z]{2}$")
```

Usage:

```Galerina
pure flow isUkPostcode(value: String) -> Bool {
  return pattern.matches(postcodePattern, value)
}
```

Rules:

```text
Pattern uses the safe engine by default.
Pattern should be compiled once where possible.
Pattern should be source-mapped.
Pattern should appear in pattern reports.
```

---

# 5. Unsafe Regex Escape Hatch

Some legacy or advanced integrations may need PCRE-style features.

These should use explicit unsafe regex blocks:

```Galerina
unsafe regex AdvancedPostcodeCheck
reason "Legacy customer postcode import requires PCRE lookaround" {
  engine "pcre2_jit"
  pattern "..."
  timeout 10ms
  max_input_length 1kb
}
```

Rules:

```text
UnsafeRegex requires a reason.
UnsafeRegex requires timeout.
UnsafeRegex requires input length limits.
UnsafeRegex must appear in security reports.
UnsafeRegex should not be allowed silently in production.
```

Example report:

```text
Unsafe regex used.
Engine: pcre2_jit
Reason required.
Timeout required.
Source: src/import/postcodes.spore:12
```

---

# 6. Multi-Pattern Scanning

Galerina should support high-performance scanning for many patterns.

Good use cases:

```text
moderation
security rules
secret detection
log scanning
document classification
large text streams
```

Syntax idea:

```Galerina
pattern_set UnsafeContentPatterns {
  engine "multi_pattern"

  patterns [
    "password\\s*=",
    "api[_-]?key\\s*=",
    "secret\\s*="
  ]

  mode "streaming"
}
```

Usage:

```Galerina
secure flow scanLogLine(line: String) -> PatternMatches {
  return pattern.scan(UnsafeContentPatterns, line)
}
```

Galerina should report the selected engine, pattern count, streaming mode and memory estimate.

---

# 7. Streaming Support

Patterns should work on streams without loading huge files into memory.

```Galerina
secure flow scanLargeLog(path: String) -> Result<PatternMatches, FileError>
effects [file.read] {
  stream lines = file.readLines(path)

  for line in lines {
    let matches = pattern.scan(SecurityPatterns, line)
    report(matches)
  }

  return Ok()
}
```

This supports Galerina's low-memory goals.

---

# 8. Compile-Time Optimisation

Galerina should compile constant patterns once.

```Galerina
readonly postcodePattern: Pattern = pattern.compile("^[A-Z]{1,2}[0-9][0-9A-Z]?\\s?[0-9][A-Z]{2}$")
```

Repeated calls reuse the compiled pattern:

```Galerina
pure flow isUkPostcode(value: String) -> Bool {
  return pattern.matches(postcodePattern, value)
}
```

Galerina should warn if a pattern is compiled repeatedly inside a loop.

```Galerina
for row in rows {
  let p = pattern.compile(row.pattern) // warning
}
```

Warning:

```text
Pattern performance warning:
Regex compiled inside loop.

Suggestion:
Compile once outside the loop or use a PatternCache.
```

---

# 9. Built-In Validators

For common validation, typed validators should be preferred over regex.

Examples:

```text
Email
Url
SafeUrl
Uuid
LanguageCode
Locale
DateTime
Money
```

Example:

```Galerina
let email: Email = Email.parse(input.email)?
```

Galerina can still implement validators internally with safe patterns, but application code should stay typed.

---

# 10. Compute Auto

Most pattern matching should use:

```text
CPU
CPU vector
safe multi-pattern engine
streaming engine
```

Specialist packages may experiment with GPU string scanning for large-scale workloads.

Photonic targets should not be a regex target. Photonic compute is better suited to matrix/vector maths, not general text pattern parsing.

---

# 11. Reports

Pattern reports should include:

```text
pattern source location
engine selected
safe or unsafe mode
denied feature diagnostics
compiled/cached status
input length limits
timeout
memory limit
pattern-set size
streaming mode
unsafe regex reason
suggested fixes
```

Example:

```json
{
  "patternReport": {
    "patterns": [
      {
        "name": "postcodePattern",
        "source": "src/validators/postcode.spore:1",
        "engine": "safe",
        "compiled": true,
        "cached": true,
        "maxInputLength": "100kb"
      }
    ],
    "unsafeRegex": [
      {
        "name": "AdvancedPostcodeCheck",
        "source": "src/import/postcodes.spore:12",
        "engine": "pcre2_jit",
        "reasonProvided": true,
        "timeout": "10ms",
        "maxInputLength": "1kb"
      }
    ]
  }
}
```

---

# 12. Non-Goals

Galerina pattern support should not:

```text
make unsafe PCRE-style regex the default
allow unbounded backtracking
allow unbounded input length
allow regex compilation inside hot loops without warning
make photonic compute a regex target
hide unsafe regex from reports
replace typed validators for common cases
silently accept dangerous regex features
```

---

# 13. Recommended Early Version

## Version 0.1

```text
Pattern type
pattern.compile
pattern.matches
safe engine policy
denied feature diagnostics
pattern report
```

## Version 0.2

```text
compiled pattern cache
compile-inside-loop warning
typed validator examples
streaming line scans
```

## Version 0.3

```text
pattern_set syntax
multi-pattern scan report
streaming pattern set mode
PatternCache
```

## Version 0.4

```text
UnsafeRegex block
PCRE2/JIT package integration policy
unsafe regex audit report
production unsafe regex gate
```

---

# Final Principle

Galerina should make safe pattern matching easy and unsafe regex obvious.

Final rule:

```text
Use Pattern by default.
Use typed validators for common formats.
Compile patterns once.
Scan streams incrementally.
Use pattern sets for many-pattern scans.
Require explicit unsafe regex policy for PCRE-style features.
Report every unsafe or expensive pattern decision.
```

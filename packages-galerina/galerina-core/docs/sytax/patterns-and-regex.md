# Galerina Pattern and Regex Syntax

Status: Draft.

This file documents proposed Galerina syntax for safe pattern matching and explicit unsafe regex.

Design context lives in:

```text
docs/safe-pattern-matching-and-regex.md
```

Usage examples live in:

```text
docs/sytax-examples/patterns-and-regex.md
```

---

## Purpose

Galerina should support fast text pattern matching while reducing ReDoS risk.

Recommended model:

```text
Pattern     = safe default
UnsafeRegex = explicit audited escape hatch
```

---

## Safe Pattern Type

```Galerina
readonly emailPattern: Pattern = pattern.compile("^[^@]+@[^@]+\\.[^@]+$")
```

```Galerina
pure flow isEmailLike(value: String) -> Bool {
  return pattern.matches(emailPattern, value)
}
```

Rules:

```text
Pattern uses the safe engine by default.
Pattern should be linear-time and bounded-memory.
Pattern should reject dangerous features.
Constant patterns should compile once.
```

---

## Typed Validator Alternative

Prefer typed validators for common cases:

```Galerina
let email: Email = Email.parse(input.email)?
```

This avoids spreading hand-written regex through application code.

---

## Pattern Policy

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

---

## Unsafe Regex Block

```Galerina
unsafe regex AdvancedPostcodeCheck
reason "Legacy customer postcode import requires PCRE lookaround" {
  engine "pcre2_jit"
  pattern "..."
  timeout 10ms
  max_input_length 1kb
}
```

Required fields:

```text
reason
engine
pattern
timeout
max_input_length
```

Rules:

```text
Unsafe regex must be audited.
Unsafe regex must be source-mapped.
Unsafe regex must appear in security reports.
Unsafe regex should be gated in production.
```

---

## Pattern Set

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

Rules:

```text
pattern_set should compile patterns as a group.
mode "streaming" supports incremental input.
pattern_set should report pattern count and memory estimate.
```

---

## Streaming Scan

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

Rules:

```text
Do not load huge files into memory for pattern scans.
Prefer line or chunk streams.
Report streaming scans in pattern reports.
```

---

## Compile-In-Loop Warning

Problem:

```Galerina
for row in rows {
  let p = pattern.compile(row.pattern)
}
```

Warning:

```text
Pattern performance warning:
Regex compiled inside loop.

Suggestion:
Compile once outside the loop or use a PatternCache.
```

Preferred:

```Galerina
let p = pattern.compile(sharedPattern)

for row in rows {
  if pattern.matches(p, row.value) {
    ...
  }
}
```

---

## Compute Target Rule

```text
Pattern matching should default to CPU, CPU vector, safe multi-pattern and streaming engines.
Do not make photonic a regex target.
GPU string scanning belongs in specialist packages only.
```

---

## Open Parser and Runtime Work

```text
parse Pattern declarations
parse pattern_policy
parse unsafe regex blocks
parse pattern_set blocks
check denied safe-regex features
emit compile-inside-loop diagnostics
emit pattern security reports
emit pattern map-manifest entries
implement or integrate a safe pattern engine
define production gates for UnsafeRegex
```

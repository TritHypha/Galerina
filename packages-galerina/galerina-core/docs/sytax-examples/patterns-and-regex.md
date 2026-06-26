# Pattern and Regex Examples

Status: Draft.

Syntax reference:

```text
docs/sytax/patterns-and-regex.md
```

Design context:

```text
docs/safe-pattern-matching-and-regex.md
```

---

## Good: Compile Once

```Galerina
readonly postcodePattern: Pattern = pattern.compile("^[A-Z]{1,2}[0-9][0-9A-Z]?\\s?[0-9][A-Z]{2}$")

pure flow isUkPostcode(value: String) -> Bool {
  return pattern.matches(postcodePattern, value)
}
```

Why:

```text
The pattern is compiled once.
The safe Pattern engine is used.
The flow stays pure.
```

---

## Good: Prefer Typed Validators

```Galerina
secure flow parseSignup(input: SignupInput) -> Result<Signup, ValidationError> {
  let email: Email = Email.parse(input.email)?

  return Ok(Signup {
    email email
  })
}
```

Why:

```text
Common validation uses a typed boundary.
Application code does not need custom regex.
Validation errors can be structured.
```

---

## Good: Pattern Policy

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
}
```

Why:

```text
Pattern behaviour is explicit.
Unsafe features are denied.
Memory, input and time limits are declared.
```

---

## Good: Streaming Scan

```Galerina
secure flow scanLargeLog(path: String) -> Result<Void, FileError>
effects [file.read] {
  stream lines = file.readLines(path)

  for line in lines {
    let matches = pattern.scan(SecurityPatterns, line)
    report(matches)
  }

  return Ok()
}
```

Why:

```text
The file is streamed line by line.
The flow does not load the whole file into memory.
File access is declared.
```

---

## Good: Multi-Pattern Set

```Galerina
pattern_set SecurityPatterns {
  engine "multi_pattern"

  patterns [
    "password\\s*=",
    "api[_-]?key\\s*=",
    "secret\\s*="
  ]

  mode "streaming"
}
```

```Galerina
secure flow scanLogLine(line: String) -> PatternMatches {
  return pattern.scan(SecurityPatterns, line)
}
```

Why:

```text
Multiple patterns can be compiled together.
Streaming mode is explicit.
The pattern set can appear in pattern reports.
```

---

## Good: Explicit Unsafe Regex

```Galerina
unsafe regex LegacyPostcodeImport
reason "Legacy import requires PCRE lookaround from old customer exports" {
  engine "pcre2_jit"
  pattern "..."
  timeout 10ms
  max_input_length 1kb
}
```

Why:

```text
Unsafe behaviour is obvious.
A reason is present.
Timeout and input limits are present.
The regex can be audited and reported.
```

---

## Bad: Compile Inside Loop

```Galerina
for row in rows {
  let p = pattern.compile(row.pattern)

  if pattern.matches(p, row.value) {
    report(row)
  }
}
```

Why not:

```text
The pattern is compiled repeatedly.
Large loops may waste CPU.
Dynamic patterns can hide expensive behaviour.
```

Expected diagnostic:

```text
Pattern performance warning:
Regex compiled inside loop.

Suggestion:
Compile once outside the loop or use a PatternCache.
```

---

## Bad: Unsafe Feature in Safe Pattern

```Galerina
readonly repeatedWord: Pattern = pattern.compile("\\b(\\w+)\\s+\\1\\b")
```

Why not:

```text
The pattern uses a backreference.
Backreferences are denied by safe pattern policy.
```

Expected diagnostic:

```text
Pattern security error:
Feature denied by safe pattern policy.

Feature:
  backreferences

Suggestion:
Use a typed parser, rewrite the pattern, or declare an audited unsafe regex with limits.
```

---

## Bad: Unbounded Unsafe Regex

```Galerina
unsafe regex LegacyPattern
reason "Needed for migration" {
  engine "pcre2_jit"
  pattern "..."
}
```

Why not:

```text
No timeout is declared.
No max input length is declared.
The unsafe regex cannot be bounded.
```

Expected diagnostic:

```text
Unsafe regex error:
Unsafe regex requires timeout and max_input_length.
```

---

## Bad: Regex for Common Type

```Galerina
let emailPattern: Pattern = pattern.compile("^[^@]+@[^@]+\\.[^@]+$")

let emailOk = pattern.matches(emailPattern, input.email)
```

Why not:

```text
Email should use a typed validator where possible.
Regex-only validation loses structured error detail.
```

Preferred:

```Galerina
let email: Email = Email.parse(input.email)?
```

---

## Bad: Photonic Regex Target

```Galerina
compute target photonic_mzi required {
  return pattern.scan(SecurityPatterns, text)
}
```

Why not:

```text
Photonic targets are for suitable matrix/vector maths.
Regex and text pattern parsing should use CPU, CPU vector, streaming or specialist string-scanning packages.
```

Expected diagnostic:

```text
Compute target error:
photonic_mzi is not a valid target for pattern scanning.
```

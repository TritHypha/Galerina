# XML Support

XML support is not a core Galerina priority, but the language should be able to interoperate with XML-based systems where needed.

## Planned Scope

```text
safe XML parsing
schema validation
explicit entity handling
size and depth limits
typed decode where practical
safe redaction
```

## Security Rule

XML parsing should deny unsafe external entity behaviour by default.

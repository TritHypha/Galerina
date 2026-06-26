# Built-In View Levels

## Purpose

Galerina should define common data exposure levels as built-in runtime/language
view levels.

The standard built-in levels are:

```galerina
runtime view public
runtime view internal
runtime view private
runtime view confidential
runtime view secret
runtime view restricted
runtime view regulated
```

These levels give `view: public`, `view: private` and related field metadata a
stable runtime meaning.

## Formal Model

The built-in view levels may be represented conceptually as:

```galerina
Runtime.View {
  public
  internal
  private
  confidential
  secret
  restricted
  regulated
}
```

Then this field:

```galerina
email: String view: private
```

links to:

```text
Runtime.View.private
```

## Built-In Level Meanings

| View Level | Runtime Meaning |
| --- | --- |
| `public` | Safe to expose under normal allowed response rules |
| `internal` | Internal system or organization use |
| `private` | Owned data, only exposed when owner checks pass |
| `confidential` | Controlled business or customer visibility |
| `secret` | Highly protected data, denied from normal output/log/AI/cache sinks |
| `restricted` | Tightly governed operational data |
| `regulated` | Compliance-controlled data |

## Standard View Behaviour

Built-in view behaviour should be defined once in the runtime standard, core
policy or boot/main runtime setup.

Example:

```galerina
runtime view private {
  expose when owner == actor
}
```

Then permissions can reference the built-in level:

```galerina
data {
  allow expose view: private
}
```

and inherit the standard private exposure rule.

Permissions should only add conditions when narrowing the built-in behaviour or
when an explicitly reviewed policy allows widening.

See [Standard View Behaviour](standard-view-behaviour.md).

## Public View

`public` means:

```text
safe to expose under normal allowed response rules
```

Example:

```galerina
name: String view: public
```

Permission:

```galerina
data {
  allow expose view: public
}
```

This allows fields marked `Runtime.View.public` to be exposed where the response
contract and permission allow exposure.

Standard behaviour:

```galerina
runtime view public {
  expose normally
}
```

## Private View

`private` means:

```text
owned data, only exposed when owner == actor or equivalent ownership policy passes
```

Example:

```galerina
email: String view: private
```

Standard behaviour:

```galerina
runtime view private {
  expose when owner == actor
}
```

Slim permission:

```galerina
data {
  allow expose view: private
}
```

Meaning:

```text
allow expose fields marked Runtime.View.private,
inheriting owner == actor from the runtime view definition
```

Permissions may narrow the built-in rule:

```galerina
data {
  allow expose view: private when owner == actor and purpose == "support"
}
```

## Secret View

`secret` means the field is denied from ordinary exposure sinks by default.

Example:

```galerina
api_key: String view: secret
```

Default restrictions:

```text
cannot be returned in normal responses
cannot be logged
cannot be sent to AI context
cannot be stored in ordinary reports
cannot be cached by default
```

Any exception must require a narrow safe sink, explicit authority and audit.

## Runtime Usage

The runtime may use built-in view levels for:

- response filtering
- serialization filtering
- log redaction
- AI context filtering
- report redaction
- frontend exposure validation
- database field-read warnings
- model exposure reports
- ownership checks

## Custom View Levels

Galerina may later support custom project-specific view levels.

Custom levels must not weaken built-in levels or silently alias to broader
exposure.

Example future direction:

```galerina
runtime view partner_private extends private
```

Custom view levels should be explicitly declared, reported and mapped to a
known exposure policy.

## Reports

View-level reports should include:

```text
data-view-report.json
view-level-report.json
model-exposure.json
response-exposure-report.json
secret-usage-report.json
```

Reports should show:

- built-in view levels used
- custom view levels declared
- fields mapped to each view
- permissions allowing exposure
- ownership checks
- denied exposures
- secret sink decisions

## Relationship To Other Concepts

This concept refines:

- [Data Visibility View Terminology](data-visibility-view-terminology.md)
- [Standard View Behaviour](standard-view-behaviour.md)
- [Secure By Default Syntax Principles](secure-by-default-syntax-principles.md)
- [Field Read Rules](field-read-rules.md)
- [Model Security Contracts](model-security-contracts.md)

## Final Principle

```text
view: private is not an arbitrary label.

It refers to a built-in runtime view level with governed exposure rules.
```

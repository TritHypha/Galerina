# Data Visibility View Terminology

## Purpose

Galerina should use view-based operational language for field-level data
exposure.

Earlier examples used:

```galerina
message: String classify: public
```

Galerina now prefers:

```galerina
message: String view: public
```

This transition moves field exposure metadata from classification-oriented
terminology to view-oriented operational language.

## Core Rule

```text
view = who or what may see or expose this data
```

The purpose is not to classify data academically. The purpose is to govern
visibility and exposure.

## Why `classify` Was Rejected For Field Exposure

The term `classify` is problematic for field exposure metadata because it is:

```text
too close to class and OOP terminology
too abstract
too broad across security, ML, tagging and policy grouping
less suitable for controlled-language design
less direct about exposure
```

Galerina intentionally avoids class-heavy architecture, hidden inheritance and
implicit object hierarchies. `classify` creates conceptual noise near those
rejected patterns.

## Why `view` Was Chosen

`view` is:

```text
short
operationally clear
globally recognizable
AI-readable
easy for non-native English speakers
aligned with response and exposure governance
```

`view: public` directly communicates who may see the data.

## Syntax Standard

Previous field syntax:

```galerina
message: String classify: public
```

Updated field syntax:

```galerina
message: String view: public
```

Previous permission syntax:

```galerina
data {
  allow expose classify: public
}
```

Updated permission syntax:

```galerina
data {
  allow expose view: public
}
```

## Built-In View Levels

Galerina should define the standard view levels as built-in runtime/language
levels:

```galerina
runtime view public
runtime view internal
runtime view private
runtime view confidential
runtime view secret
runtime view restricted
runtime view regulated
```

Conceptual runtime model:

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

The field syntax:

```galerina
email: String view: private
```

links to:

```text
Runtime.View.private
```

Built-in levels:

```text
public
internal
private
confidential
secret
restricted
regulated
```

## View Level Meanings

| View | Meaning |
| --- | --- |
| public | Safe to expose under normal allowed response rules |
| internal | Internal system or organization use |
| private | Owned data, only exposed when owner checks pass |
| confidential | Controlled business or customer visibility |
| secret | Highly protected data |
| restricted | Tightly governed operational data |
| regulated | Compliance-controlled data |

## Example Field Definitions

```galerina
name: String view: public
email: String view: private
api_key: String view: secret
payment_id: String view: regulated
```

## Example Permission Rule

```galerina
permission profile_read {

  code {
    allow db.read
  }

  data {
    allow expose view: public
    allow expose view: private owner: actor
  }

  audit required event "profile.read"
}
```

This means:

```text
allow expose fields marked Runtime.View.public
allow expose fields marked Runtime.View.private only when the owner is the actor
```

Because built-in view levels carry standard behaviour, permissions may reference
private directly:

```galerina
data {
  allow expose view: private
}
```

and inherit the runtime rule:

```galerina
runtime view private {
  expose when owner == actor
}
```

Additional permission conditions should normally narrow the built-in rule.
Widening built-in view behaviour requires explicit policy review and reporting.

## Runtime Meaning

The runtime may use `view` for:

```text
response filtering
serialization filtering
audit filtering
AI context filtering
log filtering
API exposure checks
frontend exposure validation
model projection
```

## Separation From Other Runtime Terms

| Concern | Term |
| --- | --- |
| Data exposure | view |
| Runtime boundary | zone |
| Authority | capability |
| Runtime rules | permission |
| Compute target | target |
| Trust relationship | trust |

This keeps operational language predictable.

## Rejected Alternatives

| Alternative | Reason Rejected |
| --- | --- |
| classify | Too close to class/OOP and too broad |
| sensitivity | Abstract enterprise jargon |
| access | Overloaded with permissions |
| visibility | Potentially overloaded later |
| group | Conflicts with auth/user groups |
| list | Conflicts with collection types |
| config | Configuration meaning |
| admission | Unnatural meaning |
| use | Too broad |
| shield | Unclear semantics |
| danger | Implies risk rather than visibility |

## Compatibility Note

Existing documents may still use `classification` for broader security
classification, input classification, AI classification, threat classification
or compute classification. Those uses are separate from field exposure
metadata.

See [Built-In View Levels](builtin-view-levels.md) for the formal runtime view
level model. See [Standard View Behaviour](standard-view-behaviour.md) for the
rule inheritance model.

For field-level data exposure and permission exposure rules, prefer:

```text
view
```

## Final Principle

```text
Use words that describe operational meaning directly,
not abstract enterprise terminology.
```

## Final Definition

```text
view = who or what may see this data
```

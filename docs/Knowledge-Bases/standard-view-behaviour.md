# Standard View Behaviour

## Purpose

Galerina should define common view behaviour once in the runtime/language
standard, then let permissions reference those view levels.

The core principle is:

```text
Define common view behaviour once.
Reference it everywhere.
Override only when needed.
```

This keeps permission syntax clean and reduces repeated ownership conditions.

## Runtime Standard Ownership

The meaning of built-in view levels should be defined in the runtime standard,
core policy or boot/main runtime setup.

Example:

```galerina
runtime view private {
  expose when owner == actor
}
```

Then this permission:

```galerina
data {
  allow expose view: private
}
```

inherits the standard private exposure rule.

## Public Behaviour

`public` should define normal allowed exposure:

```galerina
runtime view public {
  expose normally
}
```

Meaning:

```text
fields marked Runtime.View.public may be exposed when a permission and response
contract allow public exposure
```

Example:

```galerina
data {
  allow expose view: public
}
```

## Private Behaviour

`private` should define owner-only exposure by default:

```galerina
runtime view private {
  expose when owner == actor
}
```

Meaning:

```text
fields marked Runtime.View.private may be exposed only when the data owner is
the current actor
```

This allows slimmer permission syntax:

```galerina
data {
  allow expose view: private
}
```

instead of repeating:

```galerina
data {
  allow expose view: private when owner == actor
}
```

## Narrowing Behaviour

Permissions may add narrower conditions.

Example:

```galerina
data {
  allow expose view: private when owner == actor and purpose == "support"
}
```

This keeps the built-in owner rule and adds a stricter purpose condition.

## Widening Behaviour

Permissions should not silently widen built-in view behaviour.

For example, this should not be allowed as an ordinary permission rule:

```galerina
data {
  allow expose view: private when role == "support_admin"
}
```

Reason:

```text
it removes the owner == actor behaviour from Runtime.View.private
```

If a policy needs broader access, it should require an explicit named policy,
review, audit and report entry.

Example direction:

```galerina
data {
  allow expose view: private widen with policy SupportPrivateAccess
}
```

The exact widening syntax can be decided later. The principle is that broadening
built-in view behaviour must be visible, reviewed and reported.

## Permission Meaning

With standard view behaviour, this:

```galerina
data {
  allow expose view: public
  allow expose view: private
}
```

means:

```text
public  = expose normally
private = expose only when owner == actor
```

because `private` already carries that rule.

## Reports

View behaviour reports should show:

```text
view-level-report.json
view-behaviour-report.json
data-view-report.json
response-exposure-report.json
view-override-report.json
```

Report entries should include:

- view level
- built-in exposure rule
- permission reference
- inherited conditions
- additional narrowing conditions
- attempted widening
- policy used for approved widening
- audit requirement

## Relationship To Other Concepts

This concept refines:

- [Built-In View Levels](builtin-view-levels.md)
- [Data Visibility View Terminology](data-visibility-view-terminology.md)
- [Secure By Default Syntax Principles](secure-by-default-syntax-principles.md)
- [Field Read Rules](field-read-rules.md)

## Final Principle

```text
Permissions should reference standard view behaviour.

They should not repeat common exposure rules unless they are narrowing or
explicitly reviewed widening rules.
```

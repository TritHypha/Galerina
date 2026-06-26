# Deny By Default Risk Features

## Purpose

Galerina should deny features that hide authority, hide mutation, hide execution
or force runtime guessing.

Core principle:

```text
No hidden power.
No hidden mutation.
No hidden execution.
No hidden cost.
```

## Top Security-Risk Features

These features are denied by default in normal Galerina code:

| Feature | Main risk |
| --- | --- |
| Dynamic eval / runtime code execution | remote code execution and bypassed checks |
| Unrestricted shell execution | system compromise |
| Hidden network access | data exfiltration and policy bypass |
| Raw filesystem access | data leakage, path traversal and destructive writes |
| Global mutable variables | hidden state, races and stale authority |
| Unsafe native interop | memory corruption and sandbox escape |
| Raw pointers / unchecked memory | memory corruption and unsafe aliasing |
| Monkey patching | hidden runtime behaviour changes |
| Reflection that bypasses policy | type/effect/report bypass |
| AI self-granting capabilities | uncontrolled authority expansion |

If any of these exists at all, it must sit behind:

```text
declared effect
+ capability
+ policy approval
+ audit record
```

## Complexity And Speed-Hurting Features To Leave Out

These features should be excluded from the core runtime model because they hide
behaviour or create runtime guessing:

| Feature | Why to avoid it |
| --- | --- |
| Inheritance | hidden behaviour and fragile hierarchy chains |
| Multiple inheritance | ambiguous behaviour and complex method resolution |
| Runtime monkey patching | hidden mutation and audit drift |
| Heavy reflection | runtime guessing and policy bypass risk |
| Dynamic typing as the main model | late errors and unclear contracts |
| Hidden magic decorators/attributes | invisible behaviour and authority |
| Automatic global dependency injection | hidden dependencies and lifecycle cost |
| Unbounded garbage/runtime background work | unpredictable memory and latency |
| Implicit async behaviour | hidden scheduling and cancellation paths |
| Large default framework bundled into runtime | startup cost and larger trusted base |

Rule:

```text
If a feature hides behaviour, hides authority, or forces runtime guessing,
leave it out.
```

## Safer Alternatives

| Risky feature | Galerina alternative |
| --- | --- |
| inheritance | explicit composition |
| globals | typed vaults and explicit context |
| eval | verified generated code in quarantine |
| reflection | compile-time metadata and reports |
| dependency injection | declared capabilities and package manifests |
| dynamic plugin loading | governed plugin registration |
| implicit async | declared tasks, events and Structured Await |
| shell execution | explicit admin/tool boundary |
| raw filesystem access | typed storage/file boundary |
| hidden network access | declared network effects and outbound policy |

## Design Rule

Galerina should keep the trusted runtime small.

Features that expand authority, mutate runtime behaviour or execute external
work should be visible in source, checked by policy and recorded in reports.

## Reports

Risky feature attempts should appear in:

```text
security-risk-report.json
unsupported-feature-report.json
effect-report.json
capability-report.json
package-authority-report.json
ai-authority-request-report.json
```

## AI Guidance

AI tools must not introduce hidden power features as shortcuts. If AI suggests
eval, shell access, dynamic package install, policy-bypassing reflection or
self-granted capability changes, Galerina should report the suggestion as a
high-risk or unsupported pattern.

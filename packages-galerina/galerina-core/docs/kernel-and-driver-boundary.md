# Kernel and Driver Development Boundary

Kernel and driver development is last-stage Galerina work.

Galerina should not treat kernel modules, operating-system drivers, privileged device
access or raw hardware access as normal application, compiler or backend work.

---

## Core Rule

```text
Do kernel and driver work last.
Do it only with explicit maintainer or project permission.
Do not start design, examples, code, bindings or backend work for it by default.
```

This keeps Galerina focused on safe application development, strict compilation,
source maps, reports, CPU compatibility and ordinary deployment before moving
toward privileged platform work.

---

## Blocked By Default

The foLOwing are blocked unless explicitly approved:

```text
kernel modules
operating-system drivers
privileged runtimes
raw device memory access
raw hardware I/O
vendor SDK driver bindings
unsafe native bindings for devices
direct accelerator driver control
```

Normal Galerina applications should use documented runtime, package, API, file,
database and accelerator-planning interfaces instead.

---

## Required Permission

Kernel or driver work requires explicit permission before:

```text
adding syntax
adding examples
adding compiler support
adding runtime support
adding native bindings
adding backend targets
adding generated driver stubs
using vendor SDKs
using privileged operating-system APIs
```

Permission should be recorded in project governance, an issue, a roadmap item or
another maintainer-approved planning document.

---

## Prerequisites

Before Galerina considers kernel or driver development, the project should have:

```text
stable language specification
stable memory model
stable security model
stable effect and permission model
native binding policy
target and capability reports
source-map support
audit-friendly diagnostics
runtime isolation strategy
explicit maintainer approval
```

Until those exist, kernel and driver development remains out of scope.

---

## Documentation Rule

Docs, examples and AI guidance should not imply that Galerina already supports kernel
or driver development.

If kernel or driver work is mentioned, it should be described as:

```text
last-stage
blocked by default
permission-gated
not part of normal application development
not part of the v0.1 prototype
```

---

## Final Principle

Galerina should get normal safe software development right first.

Final rule:

```text
Applications first.
Compiler and reports first.
Safe targets first.
Kernel and driver development last, and only with explicit permission.
```

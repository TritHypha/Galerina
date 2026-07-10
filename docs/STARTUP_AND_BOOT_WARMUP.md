# Galerina Startup And Boot Warmup Position

Galerina should treat startup performance as a planning problem, not a runtime
guessing problem.

A Galerina application should be able to generate a verified boot profile before
production startup. The boot profile may include route graphs, policy graphs,
schema validators, package dependency graphs, target plans, cache metadata and
safe startup reports.

At runtime, Galerina should load the smallest safe production surface first,
verify build artefact hashes, start the application boundary, and then warm
optional packages after readiness.

Galerina may later support a boot snapshot. The first design should be a verified
bundle of deterministic artefacts such as `boot-profile.json`, route tables,
policy tables, validators, package graphs, target plans and startup reports,
not a raw runtime memory dump.

Galerina must not cache secrets, raw sensitive payloads, authorization decisions
or non-deterministic results by default. Any cache used for startup must be
bounded, content-addressed where practical, safe to delete, safe to bypass and
never required for correctness.

The goal is not to claim that Galerina is automatically faster than mature
runtimes. The goal is to make safe startup behaviour predictable, explainable,
measurable and reportable.

See [Startup And Boot Warmup](../../ZTF-Knowledge-Bases/startup-and-boot-warmup.md) and
[Preplanned Startup And Fast Response](../../ZTF-Knowledge-Bases/preplanned-startup-and-fast-response.md).

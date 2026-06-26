# 217 — Contract set validation

A contract set is a reusable governance template. Flows apply it with `use SetName`.

Rules:
- `contract set Name { ... }` declares a reusable set at program scope
- `use Name` inside a flow contract resolves to the declaration
- SPORE-GOV-011 (error): `use Name` where no `contract set Name` exists
- SPORE-GOV-012 (warning): contract set has audit requirements but flow lacks `audit.write`

Key principle: contract sets may REQUIRE behaviour (audit, validation) but cannot silently
grant authority or add effects. The flow must still declare its effects explicitly.

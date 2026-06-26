# Design

## Scope

This document describes the design of the Galerina application template and developer
experience. It does not define the final product UI for a bespoke app. Product
screens, branding, visual language and user flows should be added after a
specific app domain is selected.

The template design goal is to make the repository easy to understand, safe to
change and friendly to both humans and AI coding tools.

## Experience Principles

- Start from the workspace root and make the next useful command obvious.
- Keep package ownership visible so contributors do not put language, runtime,
  app or tooling behavior in the wrong place.
- Prefer small focused package docs over one large framework document.
- Treat generated reports and graphs as navigation aids, not sources of
  authority.
- Make unsafe or incomplete paths explicit through TODOs, reports and command
  output.
- Keep CPU-compatible local development as the baseline experience.
- Keep optional AI, low-bit, GPU and photonic support behind generic package
  contracts and target names.

## Primary Developer Flows

### Understand The Workspace

1. Open `README.md`.
2. Read the status, quick start and package map.
3. If package ownership is unclear, open `build/graph/galerina-ai-map.md` or
   `build/graph/Galerina_GRAPH_REPORT.md`.
4. Query the graph if needed:

```powershell
node packages-galerina\galerina-core-cli\dist\index.js graph query galerina-core-security --out build\graph
node packages-galerina\galerina-core-cli\dist\index.js graph explain package:galerina-core-security --out build\graph
```

### Refresh Project Context

1. Change package docs, source contracts or workspace docs.
2. Regenerate the project graph:

```powershell
node packages-galerina\galerina-core-cli\dist\index.js graph --out build\graph
```

3. Review generated graph output when the change affects package ownership,
   reports or AI instructions.

### Run Safe Automation

1. Inspect task definitions.

```powershell
node packages-galerina\galerina-core-cli\dist\index.js task --file packages-galerina\galerina-core-tasks\examples\tasks.spore
```

2. Dry-run a task before execution.

```powershell
node packages-galerina\galerina-core-cli\dist\index.js task buildApi --file packages-galerina\galerina-core-tasks\examples\tasks.spore --dry-run
```

3. Review the task report at `build/reports/task-report.json` unless a custom
   report path was passed.

### Learn Galerina

1. Start with `docs/LEARNING_MODE.md`.
2. Pick the learner level: guided blocks/forms, simple text syntax, typed app
   syntax, errors and missing values, security/effects, or packages and reports.
3. Run only safe examples with no shell, secrets, filesystem writes or external
   network unless the lesson explicitly grants a reviewed permission.
4. Read friendly diagnostics first, then reveal the precise compiler diagnostic.
5. Use reports to understand progress, common mistakes and blocked unsafe
   actions.

### Add App Features Later

1. Add product requirements to `docs/REQUIREMENTS.md`.
2. Add product UX rules and screens to this document.
3. Add app source under `packages-galerina/galerina-framework-example-app/`.
4. Keep reusable language, runtime, security and tooling contracts in their
   owning packages.

## Information Architecture

| Area | Purpose |
|---|---|
| `README.md` | Human entry point for Galerina status, package map and commands. |
| `AGENTS.md` | AI coding tool instructions and package boundary rules. |
| `galerina.workspace.json` | Machine-readable workspace package and docs index. |
| `docs/` | App/workspace requirements, design, architecture, security and operations. |
| `packages-galerina/galerina-core/` | Galerina language introduction and language documentation. |
| `packages-galerina/*/README.md` | Galerina package-specific purpose, boundaries and contracts. |
| `packages-galerina/*/TODO.md` | Galerina package-specific remaining work. |
| `build/graph/` | Generated graph, report, AI map and HTML overview. |
| `build/reports/` | Generated task and future CLI/runtime reports. |

## Documentation Design

Docs should be scannable and role-oriented.

- Put the answer to "where do I start?" in the first screen of each README.
- Keep package responsibility in the first third of package READMEs.
- Use short lists for contracts and boundaries.
- Prefer concrete commands over vague instructions.
- Record completed work in `docs/CHANGELOG.md`.
- Mark planning tasks in `docs/TASKS.md` when a document becomes usable.
- Do not duplicate large language specifications in `docs/`; link to
  `packages-galerina/galerina-core/` instead.

## CLI Output Design

CLI commands should produce concise, safe text output by default.

Required output qualities:

- State the command result in the first line.
- Print generated file paths.
- Print counts for scanned files, nodes, edges, tasks or reports where useful.
- Redact secrets, tokens, cookies, private keys and `SecureString` values.
- Use non-zero exit codes for failed commands.
- Prefer machine-readable report files for detail instead of long console logs.

Current examples:

```text
Galerina project graph generated.
Graph JSON: build\graph\galerina-devtools-project-graph.json
Graph report: build\graph\Galerina_GRAPH_REPORT.md
```

```text
Task buildApi dry-run planned.
Task file: packages-galerina\galerina-core-tasks\examples\tasks.spore
Dependency order: generateReports -> buildApi
Task report: build\reports\task-report.json
```

## Report Design

Reports should be deterministic enough for humans, tests and AI tools to use.

Project graph reports must show:

- workspace name
- generation timestamp
- package count
- document count
- exported type/function counts
- relationship count
- high-signal questions the graph can answer

Task reports must show:

- generated time
- task file
- requested task
- dry-run state
- overall status
- dependency order
- per-task effects, permissions, warnings and errors

Future reports should follow the same shape: metadata first, summary second,
diagnostics and detailed records after that.

Learning reports should show lesson, exercise, status, hint usage, diagnostic
topics and blocked unsafe actions without exposing secrets, unnecessary personal
data or raw student identifiers in shareable outputs.

## Future App UI Design

The app has no selected product domain yet. When a product is chosen, this
section should be replaced or expanded with concrete UI design.

Baseline app UI requirements:

- Use a quiet, work-focused interface for operational apps.
- Prefer dense but readable layouts over marketing-style pages for tools,
  dashboards and admin workflows.
- Use clear navigation and predictable task flows.
- Validate inputs at form boundaries.
- Show safe user-facing errors and keep internal diagnostics in reports/logs.
- Do not expose secrets, raw tokens, internal stack traces or AI prompts in UI.
- Keep accessibility requirements explicit for keyboard, contrast, labels and
  focus states.

## Component Guidance For Future Apps

Use components that match actual user work:

- forms for typed input
- tables for comparable records
- tabs for related views
- dialogs for focused confirmation or edits
- alerts for actionable errors
- status badges for state
- progress indicators for long-running jobs
- report links for generated artefacts

Avoid adding a CMS, admin framework, ORM UI or frontend framework design to
`galerina-core` or `galerina-framework-app-kernel`.

## Accessibility Baseline

Future app UI must:

- provide text labels for controls
- preserve keyboard navigation
- keep focus states visible
- avoid color-only meaning
- use readable contrast
- keep error messages close to invalid fields
- avoid overlapping text and controls on small screens

## Non-Goals

- Defining a product-specific homepage before a product domain exists.
- Defining brand, copy, illustrations or marketing pages for the template.
- Putting frontend framework syntax into `galerina-core`.
- Treating generated graph HTML as the production app UI.
- Treating task or graph reports as a substitute for tests.
- Creating a separate fake Galerina language for beginners.
- Turning Learning Mode into classroom surveillance or an unbounded AI tutor.

## Success Criteria

- A new contributor can understand the repository from `README.md`,
  `AGENTS.md`, package READMEs and `build/graph`.
- AI coding tools can find package ownership before editing.
- CLI output is concise and safe.
- Reports provide enough structured context for review.
- Future product UI work has a clear place to add screens and UX rules without
  polluting Galerina language packages.

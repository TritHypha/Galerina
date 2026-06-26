# AI Token Reduction

Galerina should reduce the amount of source text developers need to paste into AI tools.

## Generated Context

The compiler should generate compact project summaries:

```text
build/app.ai-context.json
build/app.ai-context.md
build/app.ai-guide.md
```

These files should include:

```text
entry points
source file counts
routes
webhooks
core types
flows
effects
target summaries
security summaries
diagnostic summaries
source-map references
```

## Rule

Generated AI context must not include secrets and should prefer stable identifiers over large verbatim source blocks.

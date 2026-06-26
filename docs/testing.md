# Testing

## Summary

This workspace currently uses the Galerina core prototype for checked Run Mode smoke
tests. These tests execute `.spore` source directly and do not produce compiled
artefacts.

## Current Smoke Tests

The app-kernel package has checked Run Mode fixtures:

```text
packages-galerina/galerina-framework-app-kernel/tests/hello-world.spore
packages-galerina/galerina-framework-app-kernel/tests/vector-function.spore
packages-galerina/galerina-framework-app-kernel/tests/sum.spore
packages-galerina/galerina-framework-app-kernel/tests/decimal-sum.spore
packages-galerina/galerina-framework-app-kernel/tests/json-return.spore
```

Run all app-kernel fixtures from the workspace root:

```bash
npm.cmd --prefix packages-galerina/galerina-framework-app-kernel test
```

Expected output includes:

```text
hello from Galerina app kernel test
vector total: 6
sum: 5
decimal sum: 3.50
json ids: 1,2,3 test: xxx
```

## Test Types

- Checked Run Mode smoke tests
- Unit tests
- Integration tests
- Security checks
- Manual testing
- Build verification

## Test Structure

```text
packages-galerina/galerina-framework-example-app/tests/
|-- unit/
`-- integration/

packages-galerina/galerina-framework-app-kernel/tests/
|-- hello-world.spore
|-- vector-function.spore
|-- sum.spore
|-- decimal-sum.spore
`-- json-return.spore
```


---

# `docs/COMPILED_APP_GIT.md`

```md
# Git Guide for Compiled Galerina Apps

## Purpose

This document explains how a compiled Galerina application should be handled in Git.

A Galerina app may compile to multiple targets, such as:

- CPU binary
- WASM
- ternary simulation
- future accelerator targets

## Source Versus Output

Source files should be committed.

Compiled output should usually not be committed unless the project has a specific reason.

## Commit These

- `.spore` source files
- app configuration
- tests
- documentation
- `.env.example`
- source-map configuration
- compiler configuration

## Usually Do Not Commit These

- `build/`
- `dist/`
- generated binaries
- generated WASM files
- local debug files
- local compiler reports
- temporary runtime output

## Source Maps

Source maps and debug metadata are important because compiled errors should map back to original `.spore` files and line numbers.

For local development, source maps may be generated but not committed.

For production debugging, source maps should be handled carefully because they may expose internal source structure.

## Release Builds

For official releases, compiled files can be attached to GitHub releases rather than committed to the main branch.

Suggested release artefacts:

```text
app-cpu-linux-x64.tar.gz
app-wasm.zip
compiler-report.json
security-report.json
checksums.txt
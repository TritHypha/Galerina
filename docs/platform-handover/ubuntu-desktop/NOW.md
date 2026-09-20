# Ubuntu Desktop round-two evidence - action needed now

Status: **WSL2 round-two portability is complete; no native Linux evidence was
admitted**.

The 2026-09-12 report is
`reports/wsl-linux-adapter-round-two-2026-09-12-cdfebd5b77bb.md`. Galerina's
static and functional lanes, the SLIDE contract/catalog and full 1060-test
suite passed at the named exact heads. The ignored native Linux suites refused
at the WSL2 host-identity boundary, so this run is portability evidence only.

The returned report for Galerina commit `134da79df318...` contains no receipt.
It stopped before host observation because the required independent sibling
checkout `../SLIDE` was absent. That is a setup failure, not a Linux adapter
failure, and cannot turn the roadmap green.

## Before the next Ubuntu session

The Ubuntu computer must receive one indivisible three-file transfer set, not
only a remote Galerina clone:

```text
Galerina-current.bundle
SLIDE-current.bundle
CURRENT-BUNDLE-MANIFEST.txt
```

The WSL2 rerun already has a fresh set at
`transfer/wsl-round2-2026-09-12-cdfebd5b77bb/`. For the real Ubuntu Desktop
run, create or copy the three files on the Windows computer only after both
worktrees are clean by following `TRANSFER-LOCAL-COMMITS.md`. Copy all three
files and the two independently recorded SHA-256 values to Ubuntu. Verify the
manifest and both Git bundles before cloning. Private signing files are
neither needed nor permitted.

## On Ubuntu

Follow the **On Ubuntu Desktop** block in `TRANSFER-LOCAL-COMMITS.md` first. It
must produce this exact sibling layout:

```text
<parent>/
  Galerina/.git
  SLIDE/.git
```

Both repositories must be on the named handover branches and clean. Only then
start with `CODEX-HANDOVER.md` and execute `RUNBOOK.md`.

If either bundle, branch, hash, sibling checkout or tool is missing, stop and
return one Markdown failure report. Do not substitute `triLowLevel-v2`, copied
SLIDE files, a remote branch, Docker or a renamed old receipt.

## Required return

A successful round returns the Markdown report plus four raw JSON files in
`docs/platform-handover/ubuntu-desktop/reports/`, exactly as named in
`CODEX-HANDOVER.md`. Until all four independently verify, Linux round two and
beta-v1 release admission remain non-authorizing.

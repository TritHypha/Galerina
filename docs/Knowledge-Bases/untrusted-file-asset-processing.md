# Untrusted File And Asset Processing

## Purpose

Galerina should treat images, PDFs, Office files, archives, SVGs, media files and
embedded assets as untrusted executable-adjacent content.

They may look like ordinary files, but attackers hide active or parser-hostile
content inside them:

```text
JavaScript
macros
malformed parser inputs
buffer exploit payloads
polyglot payloads
embedded HTML
SVG scripts
font exploits
PDF actions
ZIP bombs
parser corruption triggers
metadata exploits
external resource references
```

Core rule:

```text
Never trust the parser.
Never trust the file extension.
Never trust MIME alone.
```

## Intake Pipeline

Uploaded files should enter quarantine before touching application logic,
renderers, AI context, storage or databases.

Preferred flow:

```text
upload
  -> quarantine
  -> security classification
  -> bounded inspection
  -> sanitisation/conversion
  -> safe asset storage
```

The original uploaded file should not immediately touch:

```text
main runtime
browser rendering
PDF renderer
AI context
filesystem
database
```

## Parser Isolation

Parsing is dangerous because the parser itself is often the vulnerable
component.

Rejected pattern:

```text
main runtime parses PDF directly
```

Preferred model:

```text
Galerina runtime
  -> isolated parser worker
  -> strict memory/time limits
  -> no secrets
  -> no filesystem access
  -> no network access
```

If the parser crashes:

```text
worker dies
runtime survives
```

## Safe Reconstruction

The safest uploaded asset is a reconstructed file created from validated
content, not the original uploaded binary.

Images:

```text
uploaded JPG
  -> decode pixels in isolated worker
  -> discard metadata
  -> validate dimensions and pixel limits
  -> re-encode clean WebP/PNG
```

PDFs:

```text
PDF
  -> render pages in isolated worker
  -> rebuild safe PDF
```

or:

```text
PDF
  -> extract text/images only
  -> store safe structured content
```

This should remove:

```text
JavaScript
actions
forms
embedded files
launch actions
external references
malicious metadata
polyglot payloads
hidden appended data
parser tricks
```

## Active Content Denial

Active content should be denied by default:

```text
PDF JavaScript
embedded executables
Office macros
SVG scripts
HTML in metadata
external resource loading
active PDF actions
```

Default policy:

```text
active content denied
```

## Streaming And Bounds

Galerina should avoid fully trusting or fully loading large files.

Use:

```text
streamed inspection
bounded decoding
page limits
pixel limits
archive depth limits
file count limits
decoded-size estimates
time limits
memory limits
```

Prevent:

```text
ZIP bombs
image bombs
recursive archives
memory exhaustion
parser hangs
decompression amplification
```

## Strong File Classification

Galerina should classify files with security-aware types rather than treating
everything as `File`.

Candidate concepts:

```text
UntrustedPdf
UntrustedImage
UnsafeSvg
ArchiveFile
ExecutableContent
SanitizedAsset
QuarantinedAsset
ParserWorkerResult
```

These are planning concepts until formally specified.

## AI Safety

Raw PDFs, images, Office files and media should not enter AI context directly.

Preferred flow:

```text
upload
  -> quarantine
  -> classify
  -> sanitise
  -> OCR/text extraction
  -> safe structured content
  -> AI context
```

This reduces parser exploit risk and prompt-injection risk before content is
used by an AI worker.

## Runtime Rules

The runtime itself should:

```text
never render PDFs in privileged context
never execute image codecs in privileged context
never trust browser MIME alone
never auto-open uploaded files
never retain active embedded content by default
```

Parsing belongs in isolated, capability-limited workers.

## Reports

Galerina should eventually emit:

```text
file-security-report.json
sanitisation-report.json
parser-worker-report.json
asset-conversion-report.json
active-content-report.json
archive-inspection-report.json
```

Reports must be:

```text
secret-safe
machine-readable
AI-readable
audit-friendly
```

## Final Principle

Galerina should never trust uploaded files and should never trust the parser
processing them.

The safest file is a reconstructed file created from validated content, not
the original uploaded binary.

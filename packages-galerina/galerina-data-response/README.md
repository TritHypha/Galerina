# Galerina Data Response

`galerina-data-response` defines safe model-to-response mapping contracts.

Use this package for:

```text
response model declarations
model-to-response field mapping
sensitive field exclusion checks
raw model return diagnostics
API response report contracts
archive response report contracts
```

Database data should not be returned directly. It should pass through a typed
response model before leaving the server.

# Galerina Data JSON

`galerina-data-json` defines JSON streaming and archive contracts.

Use this package for:

```text
governed Json.parse / Json.encode (fungi.json.value.v1)
streaming JSON decode
JSON Lines handling
schema validation
partial extraction
redaction before archive
large document memory policy
JSON archive report contracts
```

`Json.parse` returns a closed `JsonValue` (`null | bool | string | int | array | object`).
It never returns `any`, never maps JSON numbers to IEEE float, and refuses
duplicate keys, `-0`, and unbounded memory. Taint is a label on the value, not
a JSON token; encode reports that label and does not launder it.

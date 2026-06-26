# Galerina Data Processing Packages

## Purpose

This document defines the Galerina data-processing package direction.

Data processing should be package-owned, typed, streaming-capable, memory-bounded
and reportable. Galerina core may define syntax and safety contracts used by data
pipelines, but HTML parsing, search indexing, archival storage, database
archive adapters and content extraction belong in packages.

## Package Family

Use the current lowercase Galerina package naming scheme:

```text
galerina-data
galerina-data-html
galerina-data-search
galerina-data-archive
galerina-data-db
galerina-data-model
galerina-data-query
galerina-data-response
galerina-data-json
galerina-data-database
galerina-data-pipeline
galerina-data-reports
galerina-db-postgres
galerina-db-mysql
galerina-db-sqlite
galerina-db-opensearch
galerina-db-firestore
```

`galerina-data` is the umbrella package. Focused packages own parse, search,
archive, streaming and report contracts.

## Boundary

Use data packages for:

```text
HTML parse, sanitize, render and search contracts
JSON streaming and archive contracts
database archive/export contracts
typed database model, query and response contracts
search indexing and query contracts
bounded streaming pipelines
data processing security policy
memory limits and backpressure policy
archive integrity metadata
data processing report contracts
```

Do not use data packages for:

```text
browser engine implementation
database engine implementation
search engine implementation
object storage implementation
HTML/CSS layout engine implementation
unbounded scraping frameworks
unsafe parsers
unreviewed personal-data harvesting
```

## HTML Processing

`galerina-data-html` should define contracts for:

```text
HTML parsing
safe HTML rendering
sanitization policy
link extraction
text extraction
metadata extraction
HTML search document creation
unsafe element and attribute reports
```

Example:

```text
htmlPolicy userContent {
    allow elements ["p", "a", "strong", "em", "ul", "li"]
    allow attributes ["href"] on "a"
    deny scripts
    deny inlineEventHandlers
    deny remoteImages
    report html
}
```

HTML parsing must be bounded. Large documents should use streaming extraction
where possible. Unsafe HTML must produce diagnostics and redacted reports rather
than silently rendering.

## Search

`galerina-data-search` should define:

```text
search document contracts
index input contracts
query contracts
ranking metadata
filter policy
field allowlists
PII-safe indexing policy
search report contracts
```

Search packages should not become a search engine. They define typed inputs,
outputs, policy and report contracts for search providers or future engines.

## Archive

`galerina-data-archive` should define:

```text
archive item contracts
content-addressed references
manifest contracts
hash and checksum metadata
signature metadata
retention policy references
integrity verification reports
restore reports
```

Archive integrity should be explicit:

```text
archive {
    hash: sha256
    manifest: required
    verifyOnRead: true
    retention: "project-default"
    report integrity
}
```

Archive packages should not implement object storage or backup systems. They
define contracts and reports that storage adapters can satisfy.

## JSON And Database Archiving

`galerina-data-json` should define:

```text
streaming JSON decode
JSON Lines handling
schema validation
partial extraction
redaction before archive
large document memory policy
JSON archive report contracts
```

`galerina-data-database` should define:

```text
database export contracts
snapshot metadata
schema version metadata
row count and checksum reports
restore validation references
redaction and classification hooks
```

Database archive packages must not become an ORM or migration system.

## Database Models And Responses

Galerina should support databases as a typed model and response layer, not as raw
SQL strings.

The main flow is:

```text
Database
  -> typed model
  -> validation
  -> service logic
  -> typed response
  -> API / archive / report
```

Database data should not be returned directly. Database data should pass through
a typed response model before it leaves the server.

```text
Model       = how data is stored
Input       = what the user/API may send
Query       = how data is read
Command     = how data is changed
Response    = what leaves the server
Archive     = what is retained
Report      = what proves the behaviour
```

### Model Package

`galerina-data-model` should define typed storage model contracts:

```text
model User {
    table: "users"

    id: UUID primary
    email: Email unique
    name: Text
    role: UserRole
    createdAt: DateTime
    updatedAt: DateTime
}
```

The model contract should make these facts inspectable:

```text
table or collection mapping
field names
field types
primary and unique keys
private fields
personal data fields
secret fields
fields allowed in API responses
archive and retention metadata
```

### Separate Storage Models From Response Models

A database model may contain fields that must not be returned to the browser or
API.

```text
model User {
    id: UUID primary
    email: PersonalData<Text>
    passwordHash: SecretData<Text>
    resetToken: SecretData<Text> optional
    name: Text
    role: UserRole
    createdAt: DateTime
}
```

Safe API response:

```text
response UserResponse {
    id: UUID
    name: Text
    role: UserRole
}
```

Galerina should block returning the raw model from public routes when it contains
personal, secret, hidden or internal fields:

```text
Security error:
User model contains SecretData fields.
Return a safe response model such as UserResponse.
```

### Typed Query Results

`galerina-data-query` should define typed query contracts.

```text
query GetUserById(id: UUID) -> Option<User> {
    from User
    where User.id == id
}
```

The result type is known:

```text
Option<User>
```

The missing case must be handled:

```text
match user {
    Some(found) => return UserResponse.from(found)
    None        => return NotFound("User not found")
}
```

Raw SQL should be denied by default. Parameterised or typed query contracts are
the normal path.

### Safe Response Mapping

`galerina-data-response` should define safe model-to-response mapping contracts.

```text
response UserResponse from User {
    id
    name
    role
}
```

This prevents accidental leaks such as:

```text
passwordHash
resetToken
adminNotes
internalFlags
paymentReference
```

### Model Permissions

Models can declare operation policy:

```text
model User {
    allow read by ["admin", "self"]
    allow create by ["public"]
    allow update by ["admin", "self"]
    deny delete unless role == "admin"

    fields {
        email: PersonalData<Text>
        passwordHash: SecretData<Text> hidden
    }
}
```

Model permissions should integrate with `galerina-core-security`, the app kernel
and enterprise `galerina-compliance-privacy` when that package is explicitly
unlocked.

### Validation Before Insert Or Update

Input must be validated before it reaches the database.

```text
schema CreateUserInput {
    email: Email
    name: Text min 2 max 100
    password: SecretData<Text> min 12
}
```

Unsafe direct inserts should be blocked unless the request body has been typed
and validated:

```text
User.create(request.body)
```

### Database Styles

Galerina should support a consistent model/query/command/response/archive/report
shape across:

```text
SQL databases
document databases
search indexes
key-value stores
graph databases
time-series databases
object storage metadata
```

Provider packages should be separate:

```text
galerina-db-postgres
galerina-db-mysql
galerina-db-sqlite
galerina-db-firestore
galerina-db-opensearch
```

Provider packages define adapter contracts. They must not bypass typed models,
permissions, validation, safe response mapping or reports.

### Database Archive Support

```text
archive UserAuditArchive {
    source: UserEvent

    store {
        database: "audit.user_events"
        jsonl: "./archive/user-events.jsonl"
    }

    retention {
        keepForYears: 6
    }

    integrity {
        hash: sha256
        appendOnly: true
    }
}
```

This fits `galerina-data-archive` and enterprise `galerina-compliance-retention`
when that package is explicitly unlocked.

## Streaming Pipelines

`galerina-data-pipeline` should define bounded pipeline contracts:

```text
stream sources
stream transforms
batch windows
backpressure
checkpointing
retry policy
quarantine policy
memory budgets
timeout policy
processing reports
```

Example:

```text
pipeline HtmlArchivePipeline {
    source: stream files from "/import/html"
    memory maxInFlightMb: 128
    backpressure: required
    checkpoint every: "1000 items"

    step parseHtml using galerina-data-html
    step extractText
    step redactSecrets
    step indexSearch using galerina-data-search
    step archiveJson using galerina-data-archive

    onItemError quarantine
    onSystemError stop
    report dataProcessing
}
```

## Security Rules

Data processing must be security-sensitive by default.

Required rules:

```text
deny network unless declared
deny shell execution
deny unsafe parser plugins
deny unbounded memory
deny secrets in reports
deny personal data indexing unless classified and approved
require input size limits
require content-type validation
require redaction before archive where policy says so
require archive integrity reports
```

## Memory Limits

Data processing packages must declare memory policy:

```text
memory {
    maxInFlightMb: 256
    maxItemMb: 32
    streaming: required
    spillToDisk: denied unless approved
    onOverflow: quarantine
}
```

Large files, large HTML documents, large JSON payloads and database exports
should use streaming and bounded batches.

## Reports

Data packages should define report contracts for:

```text
app.data-processing-report.json
app.html-processing-report.json
app.search-index-report.json
app.archive-report.json
app.archive-integrity-report.json
app.json-archive-report.json
app.database-archive-report.json
app.database-report.json
app.model-report.json
app.query-report.json
app.response-report.json
app.pipeline-report.json
```

Example:

```json
{
  "dataProcessing": {
    "pipeline": "HtmlArchivePipeline",
    "itemsRead": 12000,
    "itemsProcessed": 11980,
    "itemsQuarantined": 20,
    "maxInFlightMb": 128,
    "networkAccess": "denied",
    "archiveIntegrity": "verified",
    "reports": [
      "app.html-processing-report.json",
      "app.search-index-report.json",
      "app.archive-integrity-report.json"
    ],
    "warnings": []
  }
}
```

## Full Galerina-Style Example

```text
use galerina-data-html
use galerina-data-search
use galerina-data-archive

secure flow processHtmlArchive(input: HtmlArchiveRequest)
  -> Result<DataProcessingReport, DataProcessingError>
effects [file.read, file.write, compute.run] {
    permissions {
        deny network.any
        deny shell.run
    }

    memory {
        maxInFlightMb: 128
        maxItemMb: 16
        streaming: required
        onOverflow: quarantine
    }

    htmlPolicy safeContent {
        deny scripts
        deny inlineEventHandlers
        sanitize true
    }

    pipeline HtmlArchivePipeline {
        source: stream files from input.sourceDirectory
        step parseHtml policy safeContent
        step extractText
        step redactSecrets
        step createSearchDocument
        step writeSearchIndex
        step archiveJson hash sha256
        checkpoint every: "1000 items"
        report dataProcessing
    }

    return run HtmlArchivePipeline
}
```

## Final Rule

```text
Galerina data processing should be typed, streaming-capable, memory-bounded,
security-aware, archive-verifiable and reportable.
```

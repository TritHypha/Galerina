# Galerina Search and Translation Provider Boundaries

Galerina, short for **Galerina**, is a strict, memory-safe, security-first programming language and compiler/toolchain.

Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
search-provider-example.spore
translation-provider-example.spore
provider-policy.spore
```

---

## Summary

This document defines how Galerina should safely support **search and translation packages** without making search or translation native language features.

Galerina should not become:

```text
a search engine
a translation engine
a vector database
an AI platform
an image search platform
a CMS translation workflow system
a provider-specific SDK
```

Galerina should provide safe primitives that packages can use:

```text
typed inputs
typed outputs
effects
permissions
network boundaries
file boundaries
streaming
timeouts
rate limits
secret handling
redaction rules
runtime profiles
source maps
compiler reports
package reports
```

Search and translation belong in:

```text
packages
drivers
frameworks
provider SDKs
external services
application code
```

They should not be hard-coded into the Galerina language itself.

Text AI tasks such as summarisation, generation, embeddings, moderation,
document question answering and NLP workflows are covered separately in
`docs/text-ai-package-boundaries-and-compute-auto.md`. Search/translation
packages may interoperate with text AI packages, but neither area should become
native Galerina language syntax.

---

## Classification

```text
Area: Search and translation
Native language feature: No
Supported through Galerina primitives: Yes
Belongs in: Packages, provider integrations, frameworks, tooling, external services
```

---

## Core Principle

Galerina should not say:

```text
Galerina natively supports search.
Galerina natively supports translation.
Galerina natively supports vector search.
Galerina natively supports image search.
Galerina natively supports semantic search.
```

Galerina should say:

```text
Galerina supports safe typed provider boundaries that search and translation packages can use.
```

The correct model is:

```text
Galerina core:
  safe language primitives

Galerina packages:
  search providers
  translation providers
  vector search providers
  image search providers
  embedding providers

Galerina frameworks:
  search pages
  translation workflows
  CMS language switching
  admin review screens

Applications:
  enabled languages
  selected providers
  business rules
  search policies
  translation policies

External services:
  search engines
  translation APIs
  vector databases
  AI model providers
```

---

# 1. What Galerina Provides

Galerina may provide general-purpose primitives such as:

```text
Text
Locale
LanguageCode
Unicode text handling
typed records
typed results
effects
permissions
network.outbound
database.read
database.write
file.read
file.write
compute.run
safe secrets
SecureString
timeouts
rate limits
streams
structured errors
source maps
compiler reports
package reports
security reports
```

These primitives are useful for search and translation packages, but they are not search or translation features by themselves.

---

# 2. What Packages Provide

Search packages may provide:

```text
SearchText
SearchQuery
SearchFilter
SearchResults<T>
SearchResult<T>
SearchScore
SearchIndex<T>
TextEmbedding
ImageEmbedding
SemanticSearch
HybridSearch
ImageSearch
VectorSearch
```

Translation packages may provide:

```text
TranslatedText
TranslationRequest
TranslationResult
TextTranslation
TranslationProvider
LanguageDetection
TranslationMemory
```

These should be package-defined types, not required Galerina core types.

---

# 3. What Frameworks Provide

Frameworks may provide:

```text
search result pages
search box UI
faceted search UI
CMS language switchers
translation review screens
admin translation workflows
SEO hreflang generation
content translation workflows
```

These should not be native Galerina features.

---

# 4. What Applications Decide

Applications should decide:

```text
which search provider to use
which translation provider to use
which human languages are enabled
which locales are supported
which fields are searchable
which documents are indexed
which translation workflows are required
which external providers are allowed
```

Galerina should not hard-code these decisions.

---

# 5. What External Services Provide

External services may provide:

```text
OpenSearch
Elasticsearch
Meilisearch
Typesense
Solr
PostgreSQL full-text search
vector databases
Google Translate
DeepL
OpenAI
Anthropic
custom AI models
image embedding models
text embedding models
```

Galerina should not contain provider-specific logic for these systems.

Provider-specific integration belongs in packages.

---

# 6. Search Provider Example

The following is an example of how a search package might expose a typed API.

This is not native Galerina syntax. It is package-level usage built on Galerina primitives.

```Galerina
secure flow searchDocuments(query: Text) -> Result<SearchResults<TextDocument>, SearchError>
effects [network.outbound] {
  return SearchProvider.query<TextDocument> {
    text query
    fields [title, summary, body]
    limit 25
  }?
}
```

The package provides:

```text
SearchProvider
SearchResults<T>
SearchError
query<T>
```

Galerina provides:

```text
Text
Result<T, Error>
effects
network.outbound
typed function boundaries
structured errors
source maps
reports
```

---

# 7. Semantic Search Example

Semantic search should be package-defined.

Example package-level flow:

```Galerina
secure flow semanticSearch(query: Text) -> Result<SearchResults<TextDocument>, SearchError>
effects [network.outbound, compute.run] {
  let embedding = EmbeddingProvider.createTextEmbedding(query)?

  return VectorSearchProvider.search<TextDocument> {
    embedding embedding
    top_k 20
    metric "cosine"
  }?
}
```

The embedding provider and vector search provider are packages.

Galerina should not natively define:

```text
TextEmbedding
VectorSearchProvider
cosine search
embedding dimensions
model compatibility rules
```

However, Galerina can help packages enforce:

```text
typed inputs
typed outputs
limits
timeouts
permissions
safe errors
reports
```

---

# 8. Hybrid Search Example

Hybrid search combines keyword search and vector search.

This belongs in a package or application layer.

```Galerina
secure flow hybridSearchDocuments(query: Text) -> Result<SearchResults<TextDocument>, SearchError>
effects [network.outbound, compute.run] {
  let embedding = EmbeddingProvider.createTextEmbedding(query)?

  return SearchProvider.hybrid<TextDocument> {
    text query
    embedding embedding
    fields [title, summary, body]
    top_k 20
    keyword_weight 0.40
    vector_weight 0.60
  }?
}
```

Galerina should not define hybrid search as a native feature.

Galerina should support the safety model around it.

---

# 9. Image Search Example

Image search is not a native Galerina feature.

Image search belongs in packages or external services.

```Galerina
secure flow searchSimilarImages(imageFile: FileRef) -> Result<SearchResults<ImageDocument>, SearchError>
effects [file.read, network.outbound, compute.run] {
  let imageBytes = file.readBytes(imageFile)?
  let embedding = ImageEmbeddingProvider.createEmbedding(imageBytes)?

  return ImageSearchProvider.search<ImageDocument> {
    embedding embedding
    top_k 20
    metric "cosine"
  }?
}
```

Galerina provides:

```text
FileRef
file.read
binary data
effects
permissions
network.outbound
compute.run
structured errors
```

The package provides:

```text
image decoding
image embedding
image similarity search
image search provider logic
```

---

# 10. Translation Provider Example

Translation is not a native Galerina feature.

Translation belongs in packages or external services.

```Galerina
secure flow translateTextWithProvider(
  text: Text,
  sourceLanguage: Option<LanguageCode>,
  targetLanguage: LanguageCode
) -> Result<TranslatedText, TranslationError>
effects [network.outbound] {
  return TranslationProvider.translate {
    text text
    sourceLanguage sourceLanguage
    targetLanguage targetLanguage
  }?
}
```

Galerina provides:

```text
Text
LanguageCode
Option<T>
Result<T, Error>
network.outbound
effects
structured errors
secret handling
source maps
reports
```

The package provides:

```text
TranslatedText
TranslationProvider
TranslationError
provider-specific API handling
```

---

# 11. Local Translation Model Example

A local translation model is still not a native language feature.

It may be package-defined and use general Galerina compute primitives.

```Galerina
secure flow translateTextLocally(
  text: Text,
  sourceLanguage: Option<LanguageCode>,
  targetLanguage: LanguageCode
) -> Result<TranslatedText, TranslationError>
effects [compute.run] {
  return LocalTranslationPackage.translate {
    text text
    sourceLanguage sourceLanguage
    targetLanguage targetLanguage
  }?
}
```

Galerina provides:

```text
compute.run
typed input
typed output
memory limits
runtime profiles
target reports
failure reports
```

The package provides:

```text
translation model
language support
model loading
translation output
```

---

# 12. Human Language Lists

Galerina should not hard-code supported human languages.

This should not be a language-level feature:

```Galerina
supported_languages ["en-GB", "fr-FR", "ja-JP", "ar", "es-ES"]
```

That may be valid project configuration, but it should not be built into Galerina itself.

Correct distinction:

```text
Galerina:
  provides Text, Unicode handling, Locale, LanguageCode and typed boundaries.

Application:
  decides which languages and locales are enabled.

Package/provider:
  decides which languages it can translate.

Framework:
  decides how language switching and translation workflows are managed.
```

Project-level example:

```Galerina
translation_policy {
  supported_languages env.list("SUPPORTED_LANGUAGES", default: ["en-GB"])
  require_target_language true
  max_chars 20000
}
```

This is application configuration, not a language rule.

---

# 13. Search Policy

Search policy should be project or package configuration, not native language syntax.

Example project policy:

```Galerina
search_policy {
  default_limit 25
  max_limit 100
  timeout 3s

  raw_queries "deny_by_default"

  allowed_fields {
    documents [title, summary, body, tags]
    images [title, altText, tags, width, height]
  }

  reports {
    search_report true
    ranking_report true
    memory_report true
  }
}
```

Galerina may support configuration parsing, validation, reports, and effects.

The search package decides how this policy is applied.

---

# 14. Translation Policy

Translation policy should also be project or package configuration.

Example:

```Galerina
translation_policy {
  supported_languages env.list("SUPPORTED_LANGUAGES", default: ["en-GB"])
  require_target_language true
  require_source_language false
  max_chars 20000
  preserve_formatting true

  external_provider {
    require_network_permission true
    secret_redaction "required"
    pii_redaction "warn"
  }

  report true
}
```

Galerina may help validate the shape of the config and report risks.

The translation package decides how translation is performed.

---

# 15. Effects

Galerina should provide general effects.

Core effects may include:

```text
network.outbound
database.read
database.write
file.read
file.write
env.read
compute.run
cache.read
cache.write
```

Search and translation packages may define package-level effects such as:

```text
search.read
search.write
search.index
search.delete
vector_store.read
vector_store.write
translation.run
```

These should not be required core language effects.

They are useful package-defined permissions.

---

# 16. Security Rules

Galerina should support security rules that packages can use.

For search packages:

```text
raw search queries denied by default
untrusted JSON should not become a search query directly
query limits should be required
field allowlists should be supported
vector top_k limits should be supported
search deletes should require explicit permission
bulk reindexing should require explicit permission or worker policy
```

For translation packages:

```text
max input size
max token count
PII/secret redaction policy
provider permission checks
cache policy
do-not-log rules
language validation
translation result typing
```

Bad pattern:

```Galerina
SearchProvider.rawQuery(req.body)
```

Safer pattern:

```Galerina
SearchProvider.query<TextDocument> {
  text input.query
  fields [title, summary]
  limit 25
}
```

---

# 17. Compute Auto

`compute auto` is a general Galerina compute feature.

It should not be search-specific or translation-specific.

Search and translation packages may use compute auto for:

```text
text embeddings
image embeddings
semantic ranking
hybrid ranking
AI translation
query understanding
classification
re-ranking
```

Poor candidates for compute auto:

```text
permission checks
input validation
language policy checks
database writes
index deletes
exact business rules
secret redaction
```

Example package-level use:

```Galerina
secure flow rankSearchResults(
  query: RankingInput,
  candidates: Array<RankingCandidate>
) -> Result<RankedResults, RankingError>
effects [compute.run] {
  return RankingPackage.rank(query, candidates)?
}
```

Galerina provides `compute.run`, target reporting, memory limits, and fallback reporting.

The package provides the ranking model.

---

# 18. Rate Limits

Search and translation can be expensive.

Rate limits should be project or package policy.

```Galerina
effect_limits {
  search.read {
    max_per_second 100
    max_concurrent 20
  }

  translation.run {
    max_per_minute 60
    max_concurrent 4
  }

  compute.run {
    max_concurrent 4
  }
}
```

Galerina may enforce declared limits.

The package or runtime decides how provider-specific throttling works.

---

# 19. Queue and Worker Support

Bulk search and translation work may use queues or workers.

Queue systems should not be native Galerina features.

Galerina may support worker runtime profiles and typed job boundaries.

Examples of package/application jobs:

```text
bulk indexing
reindexing
embedding generation
batch translation
image embedding generation
search index rebuilds
translation review exports
```

Example:

```Galerina
job TranslateDocument {
  input documentId: DocumentId
  input targetLanguage: LanguageCode

  queue "translation_jobs"

  limits {
    timeout 60s
    max_memory 1gb
    max_retries 3
  }

  handler translateDocument
}
```

This is an application/framework pattern using Galerina primitives.

It should not mean Galerina includes a queue platform.

---

# 20. Reports

Galerina should support reports that make package behaviour visible.

Suggested outputs:

```text
app.package-report.json
app.effect-report.json
app.security-report.json
app.failure-report.json
app.memory-report.json
app.target-report.json
app.ai-guide.md
app.map-manifest.json
```

Search packages may add:

```text
app.search-report.json
app.vector-search-report.json
app.ranking-report.json
```

Translation packages may add:

```text
app.translation-report.json
app.language-policy-report.json
```

Package-specific reports should be generated by packages or tooling, using Galerina's reporting system.

## Example Package Report

```json
{
  "packageReport": {
    "package": "SearchProvider",
    "source": "src/search/search-provider-example.spore:4",
    "effects": ["network.outbound", "compute.run"],
    "packageEffects": ["search.read", "vector_store.read"],
    "usesExternalProvider": true,
    "rawQueriesAllowed": false,
    "defaultLimit": 25,
    "maxLimit": 100
  }
}
```

## Example Translation Report

```json
{
  "translationReport": {
    "package": "TranslationProvider",
    "source": "src/translation/translation-provider-example.spore:4",
    "effects": ["network.outbound"],
    "packageEffects": ["translation.run"],
    "sourceLanguage": "from input or auto",
    "targetLanguage": "from input",
    "externalProvider": true,
    "maxChars": 20000,
    "secretRedaction": "required"
  }
}
```

---

# 21. AI Guide Integration

Generated AI guide example:

```md
## Search and Translation Package Summary

Search:
- Search is provided by packages, not Galerina core.
- Raw search queries are denied by project policy.
- Search requests should be decoded into typed request objects.
- Vector search should report top_k, metric, provider and model compatibility.
- External search providers require network permission.

Translation:
- Translation is provided by packages, not Galerina core.
- Galerina does not hard-code supported human languages.
- The project controls enabled languages in boot.spore.
- External translation providers require network.outbound.
- PII and secrets must not be silently sent to external providers.

AI note:
Do not pass raw request JSON directly into search or translation providers.
Decode into typed request types first.
```

---

# 22. Package Support Example

Search and translation engines should be packages.

Example:

```Galerina
packages {
  use SearchProvider from vendor "./vendor/search-provider" {
    version "1.0.0"

    permissions {
      network "allow"
      file_read "deny"
      file_write "deny"
      environment "deny"
      shell "deny"
      unsafe "deny"
    }
  }

  use TranslationProvider from vendor "./vendor/translation-provider" {
    version "1.0.0"

    permissions {
      network "allow"
      file_read "deny"
      file_write "deny"
      environment "deny"
      shell "deny"
      unsafe "deny"
    }
  }
}
```

Rule:

```text
Packages provide engines.
Galerina provides safe usage boundaries.
```

---

# 23. Refactoring Summary

This document replaces the earlier idea that search and translation should be Galerina language or standard-library primitives.

The revised position is:

```text
Search and translation are not native Galerina features.
Search and translation are package/provider areas.
Galerina provides safe primitives that packages can use.
```

The following ideas should be removed from older documents:

```text
Galerina should natively support search.
Galerina should natively support translation.
Galerina should natively support image search.
Galerina should natively support semantic search.
Galerina should natively support vector search.
Galerina should natively define SearchText.
Galerina should natively define SearchQuery.
Galerina should natively define SearchResults<T>.
Galerina should natively define SearchIndex<T>.
Galerina should natively define TextEmbedding.
Galerina should natively define ImageEmbedding.
Galerina should natively define TextTranslation.
Galerina should natively define ImageSearch.
Galerina should natively define SemanticSearch.
Galerina should natively define HybridSearch.
Galerina should natively define vector_store effects.
Galerina should natively define translation.run.
Galerina should natively define search.read and search.write.
```

These belong in packages instead:

```text
SearchText
SearchQuery
SearchFilter
SearchResults<T>
SearchResult<T>
SearchScore
SearchIndex<T>
TextEmbedding
ImageEmbedding
ImageFeatures
TranslatedText
TranslationRequest
TranslationResult
TranslationProvider
SearchProvider
VectorSearchProvider
ImageSearchProvider
EmbeddingProvider
LanguageDetection
TranslationMemory
```

---

# 24. Non-Goals

Galerina search and translation support should not:

```text
hard-code supported human languages
force a specific search engine
force a specific translation provider
include a search UI
include a CMS translation workflow
include a translation review dashboard
include a search engine
include a translation engine
include a vector database
include native image search
include provider-specific APIs
hide vector dimensions in reports
silently use external providers
silently send PII or secrets to translation services
allow raw untrusted search queries
allow unlimited vector top_k
```

---

# 25. Open Questions

```text
Should Text be a core type or alias of String?
Should LanguageCode validate against IETF/BCP-style tags?
Should Locale be separate from LanguageCode?
Should provider packages be able to define custom effects?
Should external translation require secret/PII redaction by default?
Should vector search packages always require top_k?
Should hybrid search ranking weights be included in package reports?
Should image search packages require image safety validation first?
Should search package reports be standardised?
Should translation package reports be standardised?
```

---

# Recommended Early Version

## Version 0.1

```text
Text
Locale
LanguageCode
typed provider boundaries
network permission checks
package permissions
safe query input examples
translation provider examples
basic package reports
```

## Version 0.2

```text
package-defined search effects
package-defined translation effects
provider policy examples
redaction policy examples
rate-limit policy examples
language policy reports
```

## Version 0.3

```text
compute auto examples for packages
embedding package examples
ranking package examples
worker/job examples
search provider reports
translation provider reports
```

## Version 0.4

```text
standard package report schema
standard provider safety schema
standard redaction policy schema
standard AI guide output
target reports for compute-heavy provider packages
```

---

# Final Principle

Galerina should support search and translation safely without becoming a search engine, translation engine, vector database, AI platform, CMS workflow system, or provider SDK.

Final rule:

```text
Use typed inputs.
Use typed outputs.
Use safe provider boundaries.
Use explicit effects.
Use package permissions.
Use redaction rules.
Use rate limits.
Use timeouts.
Use reports.

Do not hard-code supported human languages.
Do not hard-code search providers.
Do not hard-code translation providers.
Do not make search native syntax.
Do not make translation native syntax.
Do not silently send private data to external services.
Do not allow raw untrusted search queries.
```

Search and translation should be built **on top of Galerina**, not **inside Galerina**.

# Arrays and String Operations

## Array Type

Galerina uses `Array<T>` for ordered collections:

```galerina
let names: safe Array<String> = ["Tom", "Sarah", "Meow"]
```

For unsafe external data:

```galerina
let raw_items: unsafe Array<String> = request.items
```

## Safe/Unsafe Propagation Rule

Trust level applies to the array as a whole, not individual elements:

```text
safe Array<String>   = safe array of safe strings
unsafe Array<String> = unsafe array of unsafe strings
```

If the array is unsafe, all its values are unsafe:

```galerina
let first = raw_items[0]
// first: unsafe String
```

Mixed-trust arrays are not supported. Keep it simple.

## Array Access

```galerina
tags[0]       // access by index
first(tags)   // first item
last(tags)    // last item
count(tags)   // number of items
```

Both index access and named functions are supported.

## split

`split` is a standard string helper that splits on a separator:

```galerina
split(value, ",")
```

`split` preserves unsafe status:

```text
split(unsafe String, safe String) -> unsafe Array<String>
```

Example:

```galerina
let raw_tags: unsafe String = request.tags
let tags: unsafe Array<String> = split(raw_tags, ",")
```

`split` does not make data safe. The result must still be validated.

## trim

Removes surrounding whitespace. Does not upgrade trust.

```text
trim(value)       = remove whitespace from both sides
trim.left(value)  = remove whitespace from start
trim.right(value) = remove whitespace from end
```

Do not use `ltrim` / `rtrim` (PHP-style names).

`trim` preserves unsafe status:

```text
trim(unsafe String) -> unsafe String
```

Even if `raw` contains SQL injection, after `trim` it remains `unsafe String`.
This is intentional — the blocked access stays blocked:

```text
Compiler error: Unsafe value cannot be used as a query parameter.
```

`trim` is a formatting and normalisation operation, not sanitisation:

```text
trim       = formatting / normalisation
guard      = inspect and reject
sanitize   = clean unsafe data
trust.data = guard + sanitize
validate   = prove shape/type/range
```

## Full Pipeline Example

```galerina
flow search(raw_tags: unsafe String) -> Result {
  let trimmed: unsafe String = trim(raw_tags)
  let parts: unsafe Array<String> = split(trimmed, ",")
  let tags: safe Array<String> = trust.each(parts)
  return find_by_tags(tags)
}
```

## Core Rules

```text
trim(unsafe String)  -> unsafe String
split(unsafe String) -> unsafe Array<String>
join(unsafe Array)   -> unsafe String
```

Only trust functions can convert `unsafe -> safe`.

## Core Principle

```text
Formatting functions may operate on unsafe data.
They must preserve unsafe status.
Only approved trust functions can return safe.
```

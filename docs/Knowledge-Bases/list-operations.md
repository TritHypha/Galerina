# List Operations

## Definition

`List<T>` is the main collection type in Galerina for ordered values.

```galerina
let items: List<Text> = ["apple", "banana", "orange"]
let users: List<User> = [User(name: "Ava"), User(name: "Ben")]
```

## Immutable vs Mutable

Immutable — return a new list when changing values:

```galerina
let items: List<Text> = ["apple", "banana"]
let updated_items: List<Text> = items.with("orange")
```

Mutable — modify in place using list methods:

```galerina
let items: List<Text> = ["apple", "banana"]
items.add("orange")
```

## Core Operations

### add

Adds a value to the end:

```galerina
items.add("orange")
// ["apple", "banana", "orange"]
```

### remove

Removes a matching value:

```galerina
items.remove("banana")
// ["apple", "orange"]
```

### insert

Adds a value at a specific position:

```galerina
items.insert(1, "banana")
// ["apple", "banana", "orange"]
```

### replace

Replaces the value at a specific position:

```galerina
items.replace(1, "pear")
// ["apple", "pear", "orange"]
```

### clear

Removes all values:

```galerina
items.clear()
// []
```

### sort

Sorts ascending by default:

```galerina
numbers.sort()
numbers.sort(order: asc)
numbers.sort(order: desc)
```

### filter

Returns only values that match a condition:

```galerina
let active_users: List<User> = users.filter(user -> user.active)
```

### map

Transforms each value into a new value:

```galerina
let names: List<Text> = users.map(user -> user.name)
```

### find

Returns the first matching value, or `none` if not found:

```galerina
let user: User? = users.find(user -> user.id == 2)
```

### has

Checks whether the list contains a value:

```galerina
let has_apple: Bool = items.has("apple")
```

### count

Returns the number of values:

```galerina
let total: Int = items.count()
```

### first

Returns the first value, or `none` if empty:

```galerina
let first_item: Text? = items.first()
```

### last

Returns the last value, or `none` if empty:

```galerina
let last_item: Text? = items.last()
```

## Operation Reference

| Operation | Purpose |
| --- | --- |
| `add(value)` | Add item to end |
| `remove(value)` | Remove matching item |
| `insert(index, value)` | Insert item at position |
| `replace(index, value)` | Replace item at position |
| `clear()` | Remove all items |
| `sort()` | Sort ascending |
| `sort(order: desc)` | Sort descending |
| `filter(condition)` | Keep matching items |
| `map(transform)` | Transform each item |
| `find(condition)` | Return first match |
| `has(value)` | Check if value exists |
| `count()` | Count items |
| `first()` | Get first item |
| `last()` | Get last item |

## Core Principle

```text
Lists should be readable.
List operations should use simple verbs.
Mutation should be controlled and explicit.
sort() defaults to ascending order.
Optional return values use none, not null.
```

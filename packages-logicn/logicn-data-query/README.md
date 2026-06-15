# LogicN Data Query

> **⚠️ Scaffold.** This package *defines* typed query/command **contracts**; the enforcement
> (raw-SQL denial, parameterised-access policy) is **declared intent, not yet a wired runtime gate**.
> Do not rely on the policies below as active guarantees.

`logicn-data-query` defines typed database query and command contracts.

Use this package for:

```text
typed query declarations
typed command declarations
parameterised access policy
raw SQL denial and exception policy
typed result contracts
missing-result handling with Option
query report contracts
```

Raw SQL is **declared** denied-by-default *in these contracts* — provider packages are expected to
use typed or parameterised query contracts unless an explicit reviewed override exists. NOTE: this is
the contract's stated policy; the runtime enforcement is pending (scaffold), not yet a wired gate.

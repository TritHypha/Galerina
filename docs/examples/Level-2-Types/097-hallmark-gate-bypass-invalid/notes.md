# 097 — A hallmark is constructed only through its gate (RD-0353, §2c#5)

Because a hallmark is a **declared branded type**, it inherits the brand construction rule
for free: a raw carrier value cannot be assigned to it. The only way to obtain a
`CustomerRef` is to pass a `String` through the gate, which returns `Result<CustomerRef, …>`
and can fail.

```fungi
let c: CustomerRef = "CUST-00000001"   // FUNGI-TYPE-003 — construction bypasses the assay
safe mut ok = assayCustomerRef(raw)?   // the sanctioned mint
```

This is the same `FUNGI-TYPE-003` (`InvalidNominalConversion`) that guards
`type X = Brand<T, "…">`; a hallmark is registered as a branded type, so the gate is reused
rather than re-implemented. A raw string is also a nominal type mismatch, so
`FUNGI-TYPE-002` is emitted alongside — both point at the same fix.

# Scheduled Chain Blocks

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

LSGR avoids hidden runtime polymorphism inside the Execution Coordination
Scheduler. Instead, scheduled work is represented as explicit typed Chain Blocks.

```text
Explicit blocks, not hidden dispatch.
```

## Why Not Polymorphism

Polymorphism can hide behaviour:

```galerina
process(data)
```

might mean different things depending on the object type. For LSGR that is
unsafe because the Execution Coordination Scheduler must know:

```text
what will run
what effects it needs
what hardware it needs
what memory it needs
what order it belongs in
what audit proof is needed
```

Hidden polymorphism makes this impossible without introspection.

## Chain Block Definition

A Chain Block defines:

```text
block type
input contract
output contract
required effects
required capabilities
memory needs
compute target
runtime budget
ordering requirements
audit requirements
next block link
```

Formally:

```text
Chain Block =
  typed task
+ declared input
+ declared output
+ declared effects
+ declared hardware target
+ declared budget
+ declared audit rule
+ next block link
```

## Example Chain

Request processing as an explicit chain:

```text
Request
 -> ValidateInputBlock
 -> ClassifyWorkloadBlock
 -> AIInferenceBlock
 -> ResponseBlock
```

Each block is fully known before execution begins.

## Safer Alternative to Polymorphism

Instead of:

```text
handler.run()
```

where the runtime must guess what `handler` is, use:

```text
block type: AIInference
input: SupportTicketSummary
output: RiskLevel
compute: NPU preferred, CPU fallback
effects: none
audit: required
```

Now the Execution Coordination Scheduler can safely link blocks together.

## Galerina Syntax Direction

```galerina
chain ProcessOrder {
  block ValidateInput {
    input: OrderRequest
    output: ValidatedOrder
    effects: none
    audit: required
  }

  block CheckInventory {
    input: ValidatedOrder
    output: InventoryResult
    effects: [inventory.read]
    compute: cpu
    audit: required
  }

  block AIRiskScore {
    input: ValidatedOrder
    output: RiskLevel
    effects: none
    compute: npu preferred, cpu fallback
    audit: required
  }

  block FinaliseOrder {
    input: [InventoryResult, RiskLevel]
    output: OrderConfirmation
    effects: [database.write, notify.send]
    audit: required
  }
}
```

## Relationship to VPI

Scheduled Chain Blocks are the governed alternative to runtime polymorphism.
When a chain of the same type and shape runs repeatedly, it may qualify for a
Verified Pipeline Interface (VPI) fast path. VPI reuses verified structure
without re-running unnecessary governance checks — but never bypasses authority.

## Core Principle

```text
Do not hide behaviour behind polymorphism.
Expose behaviour as typed scheduled blocks.
```

```text
Explicit blocks, not hidden dispatch.
```

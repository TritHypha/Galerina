# Galerina — zk-SNARK Proof Receipt Integration Plan

**Authored:** 2026-06-03
**Task:** #29 — Implement galerina-ext-proof-snarkjs Phase 1 (snarkjs Groth16 prover)

---

## Status (2026-06-03)

The `epilogue { generate_proof zk_snark_receipt }` strategy is **PARSED and VALIDATED**
(SPORE-GOV-015/016). The runtime produces a clearly-labelled PENDING stub receipt:

```
zkReceiptStub: "zk_snark_receipt:PENDING — prover not yet integrated. Planned: snarkjs/bellman backend."
```

The `ZkProof` interface and `ProverBackend` plug-in contract are already defined in
`packages-galerina/galerina-core-compiler/src/proof-graph.ts`. Real proving is forward work in
`galerina-ext-proof-snarkjs` (Phase 1).

---

## ProverBackend interface

The core compiler defines a narrow plug-in contract. The core never imports snarkjs or bellman
directly — the ext package provides an implementation at runtime injection.

```ts
/** Input to any ProverBackend implementation. */
export interface ProverInput {
  sourceText:    string;   // raw Galerina source of the flow
  contractHash:  string;   // canonical sha256 of the contract block
  resultJson?:   string;   // optional: flow execution result (for output seal)
}

/** Completed zero-knowledge proof returned by any ProverBackend. */
export interface ZkProof {
  readonly protocol:            "groth16" | "plonk";
  readonly curve:               "bn128" | "bls12-381";
  readonly proofBase64:         string;   // base64-encoded proof object
  readonly verificationKeyHash: string;   // sha256 of the verification key
  readonly publicSignalsHash:   string;   // sha256 of the public signals array
}

/** Plug-in interface — implemented by galerina-ext-proof-snarkjs (Phase 1) or
 *  galerina-ext-proof-bellman (Phase 2). Injected into generateEpilogueReceipt()
 *  via the ProofGraphContext or a module-level registry. */
export interface ProverBackend {
  prove(input: ProverInput): Promise<ZkProof>;
}
```

---

## Phase 1 — snarkjs (Groth16, pure JavaScript)

### Why snarkjs first

- Pure JavaScript/TypeScript — works in Node.js today, no build toolchain.
- Ships as a standard npm package (`snarkjs`).
- Supports Groth16 (faster verification) and PLONK.
- Phase 1 target: Groth16 over BN128 curve (most common, well-audited circuit).
- No Rust, no FFI, no napi-rs binding needed.

### Package structure

```
packages-galerina/
  galerina-ext-proof-snarkjs/          ← new, non-core (same tier as galerina-ext-secrets-vault)
    src/
      snarkjs-backend.ts             ← implements ProverBackend
      circuit/
        contract-witness.circom      ← Groth16 circuit definition
        contract-witness.wasm        ← compiled circuit (committed artifact)
        contract-witness.zkey        ← proving key (committed artifact)
        verification_key.json        ← verification key (committed artifact)
    package.json
    tsconfig.json
```

### Circuit design

**Witness:** `sha256(sourceText + contractHash)` — the circuit proves knowledge of a source
text and contract hash that hash to the declared public input seal, without revealing the
source text itself.

```
Private inputs:  sourceText (bytes), contractHash (bytes)
Public inputs:   inputSeal  = sha256(sourceText || contractHash)  [hex string]
Constraint:      sha256(private_sourceText || private_contractHash) == inputSeal
Output:          proof object + verification key
```

Circuit file: `contract-witness.circom` using the circomlib `sha256` template.
Curve: BN128 (bn128). Protocol: Groth16.

### Integration into proof-graph.ts

`generateEpilogueReceipt()` currently has this branch:

```ts
if (strategy === "zk_snark_receipt") {
  return {
    strategy: "zk_snark_receipt",
    zkReceiptStub: "zk_snark_receipt:PENDING — prover not yet integrated. Planned: snarkjs/bellman backend.",
    generatedAt,
    onFailure,
  };
}
```

When `galerina-ext-proof-snarkjs` is wired, replace with:

```ts
if (strategy === "zk_snark_receipt") {
  // Injected ProverBackend (snarkjs Phase 1 or bellman Phase 2)
  const zkProof = await opts.proverBackend.prove({
    sourceText:   opts.sourceText,
    contractHash: opts.contractHash ?? "",
    resultJson:   opts.resultJson,
  });
  return {
    strategy:    "zk_snark_receipt",
    zkProof,
    generatedAt,
    onFailure,
  };
}
```

The `zkReceiptStub` field remains on `EpilogueReceipt` for backward compatibility with the
stub receipt; `zkProof` is the live field populated when the backend is wired.

### snarkjs-backend.ts sketch

```ts
import * as snarkjs from "snarkjs";
import { createHash } from "node:crypto";
import type { ProverBackend, ProverInput, ZkProof } from "galerina-core-compiler";

const WASM_PATH = new URL("./circuit/contract-witness.wasm", import.meta.url);
const ZKEY_PATH = new URL("./circuit/contract-witness.zkey", import.meta.url);
const VK_PATH   = new URL("./circuit/verification_key.json",  import.meta.url);

export class SnarkjsGroth16Backend implements ProverBackend {
  async prove(input: ProverInput): Promise<ZkProof> {
    const witness = createHash("sha256")
      .update(input.sourceText + input.contractHash)
      .digest("hex");

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      { inputSeal: witness },
      WASM_PATH.pathname,
      ZKEY_PATH.pathname,
    );

    const vk = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(VK_PATH.pathname, "utf8")));
    const vkHash = createHash("sha256").update(JSON.stringify(vk)).digest("hex");
    const psHash = createHash("sha256").update(JSON.stringify(publicSignals)).digest("hex");

    return {
      protocol:            "groth16",
      curve:               "bn128",
      proofBase64:         Buffer.from(JSON.stringify(proof)).toString("base64"),
      verificationKeyHash: vkHash,
      publicSignalsHash:   psHash,
    };
  }
}
```

---

## Phase 2 — bellman (Rust FFI via napi-rs)

### Why bellman second

- bellman is the production-grade Rust prover used by Zcash and many production zkSNARK deployments.
- Requires a Rust toolchain and napi-rs binding — not available without a build step.
- 10–100x faster than snarkjs for large circuits; not necessary for Phase 1 circuit size.

### Package structure

```
packages-galerina/
  galerina-ext-proof-bellman/          ← new, non-core
    rust/
      src/
        lib.rs                       ← napi-rs exported prove() function
        circuit.rs                   ← bellman Groth16 circuit definition
      Cargo.toml
    src/
      bellman-backend.ts             ← thin TS wrapper, implements ProverBackend
    package.json                     ← napi-rs build configuration
```

### Upgrade path

1. Implement the same `ProverBackend` interface as the snarkjs backend.
2. The circuit is the same (sha256 witness) — only the proving engine changes.
3. Swap the injected backend in the runtime or ext registration; no changes to core.
4. `ZkProof` output shape is identical — consumers don't need to change.

---

## Verification

Any external party can verify a `ZkProof` receipt using only:
- The `proofBase64` (decode to proof object)
- The `verificationKeyHash` (fetch and verify the vk independently)
- The `publicSignalsHash` (decode to public signals array)
- Standard snarkjs `groth16.verify(vk, publicSignals, proof)` call — no Galerina runtime needed.

This satisfies the "third-party-verifiable receipt" requirement of the epilogue design.

---

## Related files

- `packages-galerina/galerina-core-compiler/src/proof-graph.ts` — `EpilogueReceipt`, `ZkProof`, `ProverBackend` interfaces; `generateEpilogueReceipt()`
- `docs/Knowledge-Bases/galerina-design-secrets-epilogue-blocks.md` — design doc, item 5 (zk-SNARK engine)
- Task #29 — implementation tracking

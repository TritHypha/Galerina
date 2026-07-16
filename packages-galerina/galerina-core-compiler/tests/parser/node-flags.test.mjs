// =============================================================================
// Parser — NodeFlags Bitmask Tests
//
// Verifies that the parser correctly attaches structural NodeFlags to flow
// declaration AST nodes. Flags are hardware-neutral — downstream passes
// (SemanticGraph, ExecutionPlanner, Backend) decide what they mean for
// each target (CPU / GPU / NPU / APU / Photonic).
//
// Flag definitions:
//   HasContract     (1 << 0) — flow declares a contract { } block
//   HasEffects      (1 << 1) — flow declares at least one effect
//   HasCompute      (1 << 2) — flow declares a compute { } block
//   TensorCandidate (1 << 3) — Tensor<> in params or return type
//   ReadonlyInputs  (1 << 4) — all parameters are readonly-qualified
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  NodeFlags,
  FUNGI_COMPUTE_001,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Helper: find the top-level flow declaration AST node by name
// ---------------------------------------------------------------------------

function findFlowNode(ast, name) {
  for (const child of ast.children ?? []) {
    if (
      (child.kind === "flowDecl" || child.kind === "pureFlowDecl" ||
       child.kind === "secureFlowDecl" || child.kind === "guardedFlowDecl") &&
      child.value === name
    ) {
      return child;
    }
  }
  return undefined;
}

function hasFlag(node, flag) {
  return ((node.flags ?? 0) & flag) !== 0;
}

// ---------------------------------------------------------------------------
// NodeFlags constant shape
// ---------------------------------------------------------------------------

describe("NodeFlags: constant shape and values", () => {
  it("NodeFlags has all 5 expected keys", () => {
    assert.ok("None"            in NodeFlags);
    assert.ok("HasContract"     in NodeFlags);
    assert.ok("HasEffects"      in NodeFlags);
    assert.ok("HasCompute"      in NodeFlags);
    assert.ok("TensorCandidate" in NodeFlags);
    assert.ok("ReadonlyInputs"  in NodeFlags);
  });

  it("NodeFlags.None is 0", () => {
    assert.equal(NodeFlags.None, 0);
  });

  it("NodeFlags flags are distinct powers of 2", () => {
    const flags = [NodeFlags.HasContract, NodeFlags.HasEffects, NodeFlags.HasCompute, NodeFlags.TensorCandidate, NodeFlags.ReadonlyInputs];
    // Each must be a power of 2
    for (const f of flags) {
      assert.ok(f > 0 && (f & (f - 1)) === 0, `Flag ${f} is not a power of 2`);
    }
    // All distinct
    const flagSet = new Set(flags);
    assert.equal(flagSet.size, flags.length, "All NodeFlags values must be distinct");
  });

  it("flags can be combined with bitwise OR", () => {
    const combined = NodeFlags.HasContract | NodeFlags.HasEffects;
    assert.ok(combined & NodeFlags.HasContract, "Combined has HasContract");
    assert.ok(combined & NodeFlags.HasEffects, "Combined has HasEffects");
    assert.ok(!(combined & NodeFlags.HasCompute), "Combined does not have HasCompute");
  });
});

// ---------------------------------------------------------------------------
// HasContract flag
// ---------------------------------------------------------------------------

describe("NodeFlags: HasContract", () => {
  it("flow with contract { } sets HasContract", () => {
    const source = `flow save(data: String) -> String
contract {
  intent { "Persist data." }
  effects { database.write }
}
{
  return data
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "save");
    assert.ok(node !== undefined, "Flow 'save' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasContract), "HasContract must be set");
  });

  it("flow without contract { } does NOT set HasContract", () => {
    const source = `pure flow add(a: Int, b: Int) -> Int { return a }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "add");
    assert.ok(node !== undefined, "Flow 'add' must be found");
    assert.ok(!hasFlag(node, NodeFlags.HasContract), "HasContract must NOT be set for contractless flow");
  });
});

// ---------------------------------------------------------------------------
// HasEffects flag
// ---------------------------------------------------------------------------

describe("NodeFlags: HasEffects", () => {
  it("flow with contract.effects sets HasEffects", () => {
    const source = `flow writeLog(msg: String) -> Void
contract {
  effects {
    audit.write
  }
}
{
  return
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "writeLog");
    assert.ok(node !== undefined, "Flow 'writeLog' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasEffects), "HasEffects must be set");
  });

  it("pure flow with no effects does NOT set HasEffects", () => {
    const source = `pure flow double(x: Int) -> Int { return x }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "double");
    assert.ok(node !== undefined, "Flow 'double' must be found");
    assert.ok(!hasFlag(node, NodeFlags.HasEffects), "HasEffects must NOT be set for effect-free pure flow");
  });
});

// ---------------------------------------------------------------------------
// HasCompute flag
// ---------------------------------------------------------------------------

describe("NodeFlags: HasCompute", () => {
  it("flow with compute { } sets HasCompute", () => {
    const source = `pure flow runModel(input: Tensor<Float32, [768]>) -> Tensor<Float32, [1]>
compute {
  target npu
}
{
  return input
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "runModel");
    assert.ok(node !== undefined, "Flow 'runModel' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasCompute), "HasCompute must be set");
  });

  it("flow without compute { } does NOT set HasCompute", () => {
    const source = `pure flow greet(name: String) -> String { return name }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "greet");
    assert.ok(node !== undefined, "Flow 'greet' must be found");
    assert.ok(!hasFlag(node, NodeFlags.HasCompute), "HasCompute must NOT be set");
  });
});

// ---------------------------------------------------------------------------
// TensorCandidate flag
// ---------------------------------------------------------------------------

describe("NodeFlags: TensorCandidate", () => {
  it("flow with Tensor<> return type sets TensorCandidate", () => {
    const source = `pure flow embed(text: String) -> Tensor<Float32, [768]> {
  return text
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "embed");
    assert.ok(node !== undefined, "Flow 'embed' must be found");
    assert.ok(hasFlag(node, NodeFlags.TensorCandidate), "TensorCandidate must be set for Tensor return type");
  });

  it("flow with Tensor<> parameter sets TensorCandidate", () => {
    const source = `pure flow scale(v: Tensor<Float32, [768]>, factor: Float32) -> Float32 {
  return factor
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "scale");
    assert.ok(node !== undefined, "Flow 'scale' must be found");
    assert.ok(hasFlag(node, NodeFlags.TensorCandidate), "TensorCandidate must be set for Tensor param");
  });

  it("flow with no Tensor<> does NOT set TensorCandidate", () => {
    const source = `pure flow sum(a: Int, b: Int) -> Int { return a }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "sum");
    assert.ok(node !== undefined, "Flow 'sum' must be found");
    assert.ok(!hasFlag(node, NodeFlags.TensorCandidate), "TensorCandidate must NOT be set for non-tensor flow");
  });
});

// ---------------------------------------------------------------------------
// ReadonlyInputs flag
// ---------------------------------------------------------------------------

describe("NodeFlags: ReadonlyInputs", () => {
  it("flow where all params are readonly sets ReadonlyInputs", () => {
    const source = `secure flow handle(readonly request: Request) -> Response {
  return request
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "handle");
    assert.ok(node !== undefined, "Flow 'handle' must be found");
    assert.ok(hasFlag(node, NodeFlags.ReadonlyInputs), "ReadonlyInputs must be set when all params are readonly");
  });

  it("flow with non-readonly params does NOT set ReadonlyInputs", () => {
    const source = `flow mutating(data: String, count: Int) -> String { return data }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "mutating");
    assert.ok(node !== undefined, "Flow 'mutating' must be found");
    assert.ok(!hasFlag(node, NodeFlags.ReadonlyInputs), "ReadonlyInputs must NOT be set when params are not readonly");
  });

  it("flow with zero params does NOT set ReadonlyInputs (no params = not all-readonly)", () => {
    const source = `pure flow noParams() -> Int { return 1 }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "noParams");
    assert.ok(node !== undefined, "Flow 'noParams' must be found");
    assert.ok(!hasFlag(node, NodeFlags.ReadonlyInputs), "ReadonlyInputs must NOT be set for zero-param flow");
  });
});

// ---------------------------------------------------------------------------
// Combined flags
// ---------------------------------------------------------------------------

describe("NodeFlags: combined flags on real flows", () => {
  it("governed API flow gets HasContract | HasEffects | ReadonlyInputs", () => {
    const source = `secure flow createOrder(readonly request: CreateOrderRequest) -> CreateOrderResult
contract {
  intent { "Create a new customer order." }
  effects {
    database.write
    audit.write
  }
}
{
  return request
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "createOrder");
    assert.ok(node !== undefined, "Flow 'createOrder' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasContract),    "HasContract must be set");
    assert.ok(hasFlag(node, NodeFlags.HasEffects),     "HasEffects must be set");
    assert.ok(hasFlag(node, NodeFlags.ReadonlyInputs), "ReadonlyInputs must be set");
    assert.ok(!hasFlag(node, NodeFlags.HasCompute),    "HasCompute must NOT be set");
    assert.ok(!hasFlag(node, NodeFlags.TensorCandidate), "TensorCandidate must NOT be set");
  });

  it("NPU inference flow gets HasCompute | TensorCandidate", () => {
    const source = `pure flow infer(input: Tensor<Float32, [768]>) -> Tensor<Float32, [10]>
compute {
  target npu
}
{
  return input
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "infer");
    assert.ok(node !== undefined, "Flow 'infer' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasCompute),      "HasCompute must be set");
    assert.ok(hasFlag(node, NodeFlags.TensorCandidate), "TensorCandidate must be set");
    assert.ok(!hasFlag(node, NodeFlags.HasEffects),     "HasEffects must NOT be set");
  });
});

// ---------------------------------------------------------------------------
// IsPure and IsSecure flags
// ---------------------------------------------------------------------------

describe("NodeFlags: IsPure and IsSecure", () => {
  it("pure flow sets IsPure", () => {
    const source = `pure flow square(x: Int) -> Int { return x }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "square");
    assert.ok(node !== undefined, "Flow 'square' must be found");
    assert.ok(hasFlag(node, NodeFlags.IsPure), "IsPure must be set for pure flow");
    assert.ok(!hasFlag(node, NodeFlags.IsSecure), "IsSecure must NOT be set for pure flow");
  });

  it("secure flow sets IsSecure", () => {
    const source = `secure flow handleWebhook(readonly request: Request) -> Response {
  return request
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "handleWebhook");
    assert.ok(node !== undefined, "Flow 'handleWebhook' must be found");
    assert.ok(hasFlag(node, NodeFlags.IsSecure), "IsSecure must be set for secure flow");
    assert.ok(!hasFlag(node, NodeFlags.IsPure), "IsPure must NOT be set for secure flow");
  });

  it("plain flow sets neither IsPure nor IsSecure", () => {
    const source = `flow plain(x: Int) -> Int { return x }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "plain");
    assert.ok(node !== undefined, "Flow 'plain' must be found");
    assert.ok(!hasFlag(node, NodeFlags.IsPure), "IsPure must NOT be set for plain flow");
    assert.ok(!hasFlag(node, NodeFlags.IsSecure), "IsSecure must NOT be set for plain flow");
  });
});

// ---------------------------------------------------------------------------
// HasPrivacy flag
// ---------------------------------------------------------------------------

describe("NodeFlags: HasPrivacy", () => {
  it("flow with contract.privacy sets HasPrivacy", () => {
    const source = `secure flow getPatient(readonly request: Request) -> PatientData
contract {
  intent { "Retrieve patient record." }
  privacy {
    level redacted
    pii email phone_number
  }
  effects {
    database.read
  }
}
{
  return request
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "getPatient");
    assert.ok(node !== undefined, "Flow 'getPatient' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasPrivacy), "HasPrivacy must be set when contract.privacy is declared");
  });

  it("flow with contract but no privacy block does NOT set HasPrivacy", () => {
    const source = `flow save(data: String) -> String
contract {
  intent { "Save data." }
  effects { database.write }
}
{
  return data
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "save");
    assert.ok(node !== undefined, "Flow 'save' must be found");
    assert.ok(!hasFlag(node, NodeFlags.HasPrivacy), "HasPrivacy must NOT be set without privacy block");
  });
});

// ---------------------------------------------------------------------------
// prefer [...] hardware hint — preferHint AST node + HasCompute flag
// ---------------------------------------------------------------------------

describe("NodeFlags + prefer hint: prefer [npu] sets HasCompute", () => {
  it("flow with prefer [npu] sets HasCompute", () => {
    const source = `pure flow runInference(input: Tensor<Float32, [768]>) -> Tensor<Float32, [10]>
prefer [npu]
{
  return input
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "runInference");
    assert.ok(node !== undefined, "Flow 'runInference' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasCompute), "HasCompute must be set for prefer [npu] flow");
    assert.ok(hasFlag(node, NodeFlags.TensorCandidate), "TensorCandidate must be set");
  });

  it("prefer [gpu, npu, cpu] produces preferHint node with value 'gpu,npu,cpu'", () => {
    const source = `pure flow embed(text: String) -> Tensor<Float32, [768]>
prefer [gpu, npu, cpu]
{
  return text
}
`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "embed");
    assert.ok(node !== undefined, "Flow 'embed' must be found");
    assert.ok(hasFlag(node, NodeFlags.HasCompute), "HasCompute must be set");

    // Find the preferHint child
    const preferNode = (node.children ?? []).find((c) => c.kind === "preferHint");
    assert.ok(preferNode !== undefined, "preferHint child must exist");
    assert.equal(preferNode.value, "gpu,npu,cpu", "preferHint value must encode targets as comma-separated");
  });

  it("flow without prefer or compute does NOT set HasCompute", () => {
    const source = `pure flow add(a: Int, b: Int) -> Int { return a }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "add");
    assert.ok(node !== undefined, "Flow 'add' must be found");
    assert.ok(!hasFlag(node, NodeFlags.HasCompute), "HasCompute must NOT be set for plain flow");
  });
});

// ---------------------------------------------------------------------------
// NodeFlags.None — no flags set for simple flow
// ---------------------------------------------------------------------------

describe("NodeFlags: None for simple flow", () => {
  it("simple pure flow with no contract/effects/compute has flags === 0 OR IsPure only", () => {
    const source = `pure flow identity(x: Int) -> Int { return x }`;
    const { ast } = parseProgram(source, "test.fungi");
    const node = findFlowNode(ast, "identity");
    assert.ok(node !== undefined, "Flow 'identity' must be found");
    // Only IsPure should be set — no contract, no effects, no compute
    const flags = node.flags ?? 0;
    assert.ok(flags & NodeFlags.IsPure, "IsPure must be set for pure flow");
    assert.ok(!(flags & NodeFlags.HasContract), "HasContract must NOT be set");
    assert.ok(!(flags & NodeFlags.HasEffects), "HasEffects must NOT be set");
    assert.ok(!(flags & NodeFlags.HasCompute), "HasCompute must NOT be set");
  });
});

// ---------------------------------------------------------------------------
// FUNGI-COMPUTE-001 constant shape (detection is compiler/SemanticGraph job)
// ---------------------------------------------------------------------------

describe("FUNGI_COMPUTE_001: constant shape", () => {
  it("FUNGI_COMPUTE_001 has correct code and severity", () => {
    assert.equal(FUNGI_COMPUTE_001.code, "FUNGI-COMPUTE-001");
    assert.equal(FUNGI_COMPUTE_001.name, "COMPUTE_TARGET_INCOMPATIBLE_PATTERN");
    assert.equal(FUNGI_COMPUTE_001.severity, "warning");
    assert.ok(typeof FUNGI_COMPUTE_001.message === "string");
    assert.ok(typeof FUNGI_COMPUTE_001.why === "string");
    assert.ok(typeof FUNGI_COMPUTE_001.suggestedFix === "string");
  });
});

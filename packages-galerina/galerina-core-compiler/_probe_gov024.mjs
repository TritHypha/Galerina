import { parseProgram, checkEffects, verifyGovernance } from "./dist/index.js";

const src = `
secure flow isolatedCompute(input: String) -> Result<String, String>
contract {
  intent { "Run an isolated computation step." }
  effects { }
}
{
  let result = step innerCompute(input)
  return Ok(result)
}
pure flow innerCompute(x: String) -> String {
  return x
}
`;

const parsed = parseProgram(src, "test.fungi");
console.log("Parse errors:", parsed.diagnostics?.map(d => d.code + " " + d.message) ?? []);
const effects = checkEffects(parsed.flows, parsed.ast);
const result = verifyGovernance(parsed.ast, parsed.flows, effects, "dev");
const g024 = result.diagnostics.filter(d => d.code === "FUNGI-GOV-024");
console.log("GOV-024 diags:", JSON.stringify(g024, null, 2));
console.log("All diag codes:", result.diagnostics.map(d => d.code + "(" + d.severity + ")").join(", "));

// Try to find step nodes in the AST
const findNodes = (node, kind) => {
  const out = [];
  if (!node) return out;
  if (node.kind === kind) out.push(node);
  for (const c of node.children ?? []) out.push(...findNodes(c, kind));
  return out;
};
const stepNodes = findNodes(parsed.ast, "callExpr").filter(n => (n.value ?? "").startsWith("step:"));
console.log("Step callExpr nodes found:", stepNodes.length);

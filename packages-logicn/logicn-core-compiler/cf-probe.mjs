import {
  parseProgram,
  checkTypes,
  checkValueStates,
  resolveSymbols,
  executeFlow,
} from "./dist/index.js";

function tc(source) {
  const parsed = parseProgram(source, "p.lln");
  const r = checkTypes(parsed.ast);
  return { parseDiags: parsed.diagnostics ?? [], tcDiags: r.diagnostics ?? [] };
}

async function run(source, flow, args = new Map()) {
  const parsed = parseProgram(source, "p.lln");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  try {
    const res = await executeFlow(flow, args, parsed.ast);
    return { ok: true, value: res.value, result: res.audit?.result, diags: res.diagnostics };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function diagCodes(d) { return d.map(x => x.code).join(",") || "(none)"; }

console.log("=== T1: if condition is Int (non-Bool) — does type-checker reject? ===");
{
  const r = tc(`flow t() -> Int {
  let x: Int = 5
  if x { return 1 }
  return 0
}`);
  console.log("parse:", diagCodes(r.parseDiags), "| tc:", diagCodes(r.tcDiags));
}

console.log("\n=== T2: if condition is String — type-checker? + runtime truthiness ===");
{
  const r = tc(`flow t() -> Int {
  let s: String = "hello"
  if s { return 1 }
  return 0
}`);
  console.log("tc:", diagCodes(r.tcDiags));
  const rr = await run(`flow t() -> Int {
  let s: String = "hello"
  if s { return 1 }
  return 0
}`, "t");
  console.log("run:", JSON.stringify(rr));
  const rr2 = await run(`flow t() -> Int {
  let s: String = ""
  if s { return 1 }
  return 0
}`, "t");
  console.log("run empty-string:", JSON.stringify(rr2));
}

console.log("\n=== T3: while condition is Int — accepted? loop on non-zero int ===");
{
  const r = tc(`flow t() -> Int {
  let mut n: Int = 3
  while n { n = n - 1 }
  return n
}`);
  console.log("tc:", diagCodes(r.tcDiags));
  const rr = await run(`flow t() -> Int {
  let mut n: Int = 3
  while n { n = n - 1 }
  return n
}`, "t");
  console.log("run:", JSON.stringify(rr));
}

console.log("\n=== T4: match exhaustiveness — missing wildcard ===");
{
  const r = tc(`flow t(x: Int) -> Int {
  match x {
    1 => return 10
    2 => return 20
  }
  return 0
}`);
  console.log("tc:", diagCodes(r.tcDiags));
}

console.log("\n=== T5: match with no matching arm but has wildcard ===");
{
  const rr = await run(`flow t() -> Int {
  let x: Int = 99
  return match x {
    1 => 10
    _ => 0
  }
}`, "t");
  console.log("run:", JSON.stringify(rr));
}

console.log("\n=== T6: match with NO wildcard, value falls through (runtime) ===");
{
  // Bypass tc by running directly; what does interpreter return on no-match no-wildcard?
  const rr = await run(`flow t() -> Int {
  let x: Int = 99
  return match x {
    1 => 10
    2 => 20
  }
}`, "t");
  console.log("run (no wildcard, no match):", JSON.stringify(rr));
}

console.log("\n=== T7: break / continue keywords ===");
{
  const r = tc(`flow t() -> Int {
  let mut n: Int = 0
  while true { break }
  return n
}`);
  console.log("break tc:", diagCodes(r.tcDiags));
  const rr = await run(`flow t() -> Int {
  let mut n: Int = 0
  while true { break }
  return n
}`, "t");
  console.log("break run:", JSON.stringify(rr));
}

console.log("\n=== T8: while-true with no break — iteration cap fail-closed? ===");
{
  const rr = await run(`flow t() -> Int {
  let mut n: Int = 0
  while true { n = n + 1 }
  return n
}`, "t");
  console.log("run:", JSON.stringify(rr));
}

console.log("\n=== T9: for-where guard with non-Bool (string) guard ===");
{
  const rr = await run(`flow t() -> Int {
  let mut total: Int = 0
  for x in [1, 2, 3, 4] where x > 2 { total = total + x }
  return total
}`, "t");
  console.log("for-where run:", JSON.stringify(rr));
}

console.log("\n=== T10: return type mismatch from match arm ===");
{
  const r = tc(`flow t() -> Int {
  let x: Int = 1
  return match x {
    1 => "string-not-int"
    _ => 0
  }
}`);
  console.log("tc:", diagCodes(r.tcDiags));
}

console.log("\n=== T11: if with Option (some/none) condition ===");
{
  const rr = await run(`flow t() -> Int {
  let o: Option<Int> = some(5)
  if o { return 1 }
  return 0
}`, "t");
  console.log("run some():", JSON.stringify(rr));
}

console.log("\n=== T12: missing return — flow falls off end with -> Int ===");
{
  const r = tc(`flow t(x: Int) -> Int {
  if x > 0 { return 1 }
}`);
  console.log("tc (no else, no trailing return):", diagCodes(r.tcDiags));
  const rr = await run(`flow t(x: Int) -> Int {
  if x > 0 { return 1 }
}`, "t", new Map([["x", { __tag: "int", value: -5 }]]));
  console.log("run x=-5 (falls off):", JSON.stringify(rr));
}

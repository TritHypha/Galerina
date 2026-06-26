import { parseProgram, checkTypes } from "../dist/index.js";

const src = `
pure flow example(a: Tensor<Float32, [4, 8]>, b: Tensor<Float32, [8, 4]>) -> Void {
  let wrong = a + b
}`;

const p = parseProgram(src, "test.spore");
const t = checkTypes(p.ast);
if (t.diagnostics.length === 0) {
  console.log("No diagnostics — tensor add NOT caught");
} else {
  t.diagnostics.forEach(d => console.log(`${d.code}: ${d.message.slice(0, 80)}`));
}

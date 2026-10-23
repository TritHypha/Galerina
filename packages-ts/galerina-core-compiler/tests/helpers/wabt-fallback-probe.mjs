import * as L from "../../dist/index.js";

const validWAT = `(module
  (memory 2 2048)
  (func $f (result i32)
    (i32.const 0)
  )
  (export "f" (func $f))
)`;
const malformedWAT = `(module
  (func $f (result i32)
    (i32.const)
  )
)`;
const toPublicResult = (result) => ({
  valid: result.valid,
  diagnostics: result.diagnostics.map((diagnostic) => diagnostic.message),
});

const outcomes = {
  valid: toPublicResult(await L.assembleWAT(validWAT)),
  malformed: toPublicResult(await L.assembleWAT(malformedWAT)),
};
process.stdout.write(JSON.stringify(outcomes));

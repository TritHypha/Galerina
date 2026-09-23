// Supervised child: real loadRegistryGeneration against a disposable file.
// The planted bytes need not be a valid generation: the TOCTOU is at open.
import { mkdirSync, writeFileSync } from "node:fs";
import { loadRegistryGeneration } from "../../galerina-framework-app-kernel/dist/index.js";

const dir = process.env.Q3_DIR;
const generationId = process.env.Q3_GENERATION_ID;
if (typeof dir !== "string" || typeof generationId !== "string") {
  console.error("Q3_DIR and Q3_GENERATION_ID required");
  process.exit(2);
}

mkdirSync(dir, { recursive: true });
const planted = `${dir.replace(/\\/g, "/")}/registry-generation-${generationId}.json`;
writeFileSync(planted, "{\"x\":1}");
try {
  await loadRegistryGeneration({
    directory: dir,
    generationId,
    verify: {
      expectedDelegationSerial: 1,
      publicBundle: { scheme: "test-non-durable" },
      minIndexIssuedAt: "2020-01-01T00:00:00.000Z",
    },
  });
  console.log("LOAD_OK");
  process.exit(3);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log("MSG", msg);
  if (/fifo|FIFO|special file|not a bounded regular file/i.test(msg)) {
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
}

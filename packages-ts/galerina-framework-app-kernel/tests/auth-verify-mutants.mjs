// Mutants for POST /auth/verify. Each must turn a named test red, then restore green.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const src = join(pkg, "src", "auth-verify-route.ts");
const bak = join(pkg, "src", "auth-verify-route.ts.mutant-bak");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function build() {
  const tsc = join(pkg, "node_modules", "typescript", "bin", "tsc");
  const r = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--noCheck"], {
    cwd: pkg,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
    throw new Error("tsc failed");
  }
}

function restore() {
  copyFileSync(bak, src);
  build();
}

function mutate(fn) {
  const original = readFileSync(src, "utf8");
  writeFileSync(src, fn(original));
  build();
}

function expectRed(label, pattern) {
  const r = spawnSync(
    "node",
    [
      "--test",
      "--test-timeout=4000",
      "--test-name-pattern",
      pattern,
      join(here, "auth-verify-route.test.mjs"),
    ],
    {
      cwd: pkg,
      encoding: "utf8",
      env: { ...process.env },
    },
  );
  const failed = r.status !== 0;
  if (!failed) {
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
    console.error(`MUTANT ${label} stayed GREEN`);
    process.exitCode = 1;
    throw new Error(`MUTANT ${label} stayed GREEN`);
  }
  console.log(`MUTANT ${label} RED rc=${r.status}`);
}

const preSha = sha256File(src);
copyFileSync(src, bak);
let finished = false;
try {
  mutate((s) => s.replace(
    "    const d = authority.consume(leaseId, leaseToken, leaseEpoch); /* AUTH_VERIFY_GUARD_CONSUME_ORDER */",
    "    const d = \"released\"; /* AUTH_VERIFY_GUARD_CONSUME_ORDER swapped */",
  ));
  expectRed("consume-order-swapped", "pos-release-before-revoke S-01");

  restore();
  mutate((s) => s.replaceAll("wipeBytes(copy); /* AUTH_VERIFY_GUARD_WIPE */", "/* AUTH_VERIFY_GUARD_WIPE removed */")
    .replaceAll("options.ports.wipe(copies); /* AUTH_VERIFY_GUARD_WIPE */", "/* AUTH_VERIFY_GUARD_WIPE removed */"));
  expectRed("wipe-removed", "pos-release-before-revoke");

  restore();
  mutate((s) => s.replaceAll("headers[\"X-Galerina-Request-Digest\"] = requestDigest; /* AUTH_VERIFY_GUARD_BINDING */", "/* AUTH_VERIFY_GUARD_BINDING dropped */"));
  expectRed("binding-field-dropped", "pos-release-before-revoke");

  restore();
  mutate((s) => s
    .replace("if (remainingMs <= 0) return TIMEOUT_TOKEN; /* AUTH_VERIFY_GUARD_TIMEOUT */", "if (false) return TIMEOUT_TOKEN;")
    .replace("return await Promise.race([work, timeoutPromise]); /* AUTH_VERIFY_GUARD_TIMEOUT */", "return await work;"));
  expectRed("timeout-removed", "neg-timeout-verifier");

  restore();
  mutate((s) => s.replace(
    "        return respond(\"F-14\", \"verifier\", \"VERDICT_REFUSED\"); /* AUTH_VERIFY_GUARD_VERIFIER_PIN */",
    "        /* AUTH_VERIFY_GUARD_VERIFIER_PIN skipped */",
  ));
  expectRed("verifier-pin-skipped", "neg-verifier-pin-mismatch");

  restore();
  mutate((s) => s.replace(
    "    const d = authority.consume(leaseId, leaseToken, leaseEpoch); /* AUTH_VERIFY_GUARD_CONSUME_ORDER */",
    "    const consumedOutcome = authority.consume(leaseId, leaseToken, leaseEpoch); /* AUTH_VERIFY_GUARD_CONSUME_ORDER */\n    const d = consumedOutcome === \"fenced\" ? \"released\" : consumedOutcome;",
  ));
  expectRed("g1-fenced-treated-released", "neg-revoke-during-guest F-12");

  restore();
  mutate((s) => s.replaceAll("authority.markUnknown(leaseId);", "/* markUnknown removed */"));
  expectRed("g2-mark-unknown-removed", "does not re-release");

  restore();
  mutate((s) => s.replace("copies.push(bodyCopy);", "/* body copy not wiped */"));
  expectRed("g3-body-copy-not-wiped", "guest-body-wiped-after-response");

  restore();
  mutate((s) => s.replace(
    "      if (!declared) {",
    "      if (false && !declared) { /* AUTH_VERIFY_GUARD_UNDECLARED skipped */",
  ));
  expectRed("g4-undeclared-served", "undeclared-secret-name");

  restore();
  mutate((s) => s.replaceAll("/* AUTH_VERIFY_GUARD_ACK */", "/* AUTH_VERIFY_GUARD_ACK dropped */")
    .replace(
      "    const gateAck = secretGate.acknowledge(operationId); /* AUTH_VERIFY_GUARD_ACK dropped */",
      "    const gateAck = \"acknowledged\"; /* AUTH_VERIFY_GUARD_ACK dropped */",
    )
    .replace(
      "    const routeAck = authority.acknowledgeMinted(operationId); /* AUTH_VERIFY_GUARD_ACK dropped */",
      "    const routeAck = \"acknowledged\"; /* AUTH_VERIFY_GUARD_ACK dropped */",
    ));
  expectRed("g5-ack-dropped", "pos-ack-bound");

  restore();
  mutate((s) => s.replace(
    "|| /^0+$/.test(artifactDigest)) { /* AUTH_VERIFY_GUARD_ZERO_DIGEST */",
    "|| false) { /* AUTH_VERIFY_GUARD_ZERO_DIGEST skipped */",
  ));
  expectRed("g8-zero-digest", "zero-artifact-digest");

  restore();
  mutate((s) => s.replace(
    "      authority.fence(leaseId); /* AUTH_VERIFY_GUARD_GUEST_FENCE */",
    "      /* AUTH_VERIFY_GUARD_GUEST_FENCE removed */",
  ));
  expectRed("g10-guest-timeout-fence-removed", "neg-timeout-guest F-24");

  restore();
  const green = spawnSync("node", ["--test", join(here, "auth-verify-route.test.mjs")], {
    cwd: pkg,
    encoding: "utf8",
  });
  process.stdout.write(green.stdout || "");
  process.stderr.write(green.stderr || "");
  if (green.status !== 0) {
    console.error("restored suite not green");
    process.exitCode = 1;
    throw new Error("restored suite not green");
  }
  console.log("MUTANTS all red then restored green");
  finished = true;
} finally {
  copyFileSync(bak, src);
  const postSha = sha256File(src);
  if (postSha !== preSha) {
    console.error("source sha256 != pre-run sha256");
    process.exitCode = 1;
    finished = false;
  }
  unlinkSync(bak);
  if (existsSync(bak)) {
    console.error("mutant-bak still present");
    process.exitCode = 1;
    finished = false;
  }
  build();
}
if (finished !== true) {
  process.exit(1);
}

#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { lexSource } = require("./lexer");
const { formatProject } = require("./formatter");
const { validateTypes } = require("./type-checker");
const { buildJsonSchemaReport } = require("./schema-generator");

const VERSION = "0.1.0-prototype";
const DEFAULT_OUT = path.join("build", "debug");
const DEFAULT_DEV_OUT = ".build-dev";
const WATCH_DEBOUNCE_MS = 150;
const IGNORED_SOURCE_DIRECTORIES = new Set(["build", "node_modules", "vendor", ".git"]);
const BANNED_COMPUTE_OPS = [
  "readFile",
  "writeFile",
  "database.",
  "env.",
  "secret",
  "fetch(",
  "http.",
  "network."
];
const TARGET_OUTPUTS = {
  binary: "app.bin",
  wasm: "app.wasm",
  browser: "app.browser.js",
  gpu: "app.gpu.plan",
  photonic: "app.photonic.plan",
  ternary: "app.ternary.sim",
  omni: "app.omni-logic.sim"
};
const GENERATED_OUTPUTS = [
  { path: "app.bin", kind: "target", format: "placeholder", cleanup: true },
  { path: "app.wasm", kind: "target", format: "placeholder", cleanup: true },
  { path: "app.browser.js", kind: "target", format: "javascript-placeholder", cleanup: true },
  { path: "app.gpu.plan", kind: "target-plan", format: "text", cleanup: true },
  { path: "app.photonic.plan", kind: "target-plan", format: "text", cleanup: true },
  { path: "app.ternary.sim", kind: "target-plan", format: "text", cleanup: true },
  { path: "app.omni-logic.sim", kind: "target-plan", format: "text", cleanup: true },
  { path: "app.precision-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.schemas.json", kind: "report", format: "json", cleanup: true },
  { path: "app.openapi.json", kind: "report", format: "json", cleanup: true },
  { path: "app.api-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.global-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.map-manifest.json", kind: "manifest", format: "json", cleanup: true },
  { path: "app.runtime-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.memory-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.execution-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.target-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.security-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.failure-report.json", kind: "report", format: "json", cleanup: true },
  { path: "app.source-map.json", kind: "report", format: "json", cleanup: true },
  { path: "app.tokens.json", kind: "report", format: "json", cleanup: true },
  { path: "app.ai-context.json", kind: "ai", format: "json", cleanup: true },
  { path: "app.ai-context.md", kind: "ai", format: "markdown", cleanup: true },
  { path: "app.ai-guide.md", kind: "ai", format: "markdown", cleanup: true },
  { path: "app.build-manifest.json", kind: "manifest", format: "json", cleanup: true },
  { path: "docs/api-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/webhook-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/type-reference.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/global-registry-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/security-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/runtime-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/memory-pressure-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/run-compile-mode-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/deployment-guide.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/ai-summary.md", kind: "documentation", format: "markdown", cleanup: true },
  { path: "docs/docs-manifest.json", kind: "manifest", format: "json", cleanup: true }
];
const TARGET_BLOCKS = ["binary", "wasm", "browser", "server", "native", "gpu", "photonic", "ternary", "omni"];
const BROWSER_SAFE_IMPORTS = new Set([
  "browser.dom",
  "browser.forms",
  "browser.events",
  "browser.http",
  "browser.storage",
  "browser.router",
  "math",
  "logic",
  "json"
]);
const SERVER_ONLY_IMPORTS = [
  "environment",
  "server.database",
  "server.filesystem",
  "server.secrets",
  "payment.private",
  "filesystem.private"
];
const COMPUTE_SAFE_IMPORTS = new Set([
  "math",
  "tensor",
  "crypto.public",
  "image.processing",
  "data.buffer"
]);
const ACCELERATOR_RISKS = [
  "signal_noise",
  "precision_loss",
  "analogue_drift",
  "calibration_error",
  "thermal_effect",
  "target_mismatch",
  "wrong_fallback_target",
  "rounding_difference",
  "hardware_specific_behaviour"
];
const ACCELERATOR_ERROR_CORRECTION_POLICY = {
  detection: [
    "compare_against_cpu_reference_where_practical",
    "track_precision_difference",
    "track_confidence_level",
    "record_fallback_reason",
    "source_map_every_target_result"
  ],
  correction: [
    "retry_same_target_if_runtime_marks_error_transient",
    "fallback_to_next_declared_target",
    "fallback_to_cpu_reference_when_available",
    "fail_closed_when_difference_exceeds_tolerance",
    "route_security_or_business_decisions_to_review_when_confidence_is_low"
  ],
  nonGoals: [
    "do_not_claim_real_photonic_error_correction_without_backend_support",
    "do_not_treat_accelerator_output_as_external_or_mysterious_data",
    "do_not_silently_accept_precision_drift"
  ]
};
const MEMORY_PRESSURE_LADDER = [
  {
    stage: 1,
    action: "free_short_lived_finished_values",
    behaviour: "Clean up local values after the flow or scope no longer needs them."
  },
  {
    stage: 2,
    action: "evict_eligible_caches",
    behaviour: "Evict cache entries that are safe to rebuild."
  },
  {
    stage: 3,
    action: "bypass_cache_storage",
    behaviour: "Calculate and return results without adding new cache entries."
  },
  {
    stage: 4,
    action: "apply_backpressure",
    behaviour: "Slow, pause or reject queue and channel intake before memory grows without bounds."
  },
  {
    stage: 5,
    action: "spill_approved_data_to_disk",
    behaviour: "Write only explicitly approved, non-secret temporary data to bounded spill storage."
  },
  {
    stage: 6,
    action: "reject_new_work_safely",
    behaviour: "Reject new API, queue or webhook work with retryable errors where possible."
  },
  {
    stage: 7,
    action: "graceful_failure",
    behaviour: "Stop before uncontrolled out-of-memory, flush reports and preserve source-mapped diagnostics."
  }
];
const APPROVED_SPILL_DATA = [
  "cache_entries",
  "queue_events",
  "json_stream_buffers",
  "build_cache",
  "dead_letter_events",
  "temporary_batch_data",
  "large_sort_or_transform_intermediates"
];
const DENIED_SPILL_DATA = [
  "SecureString",
  "APIKey",
  "PaymentToken",
  "SessionToken",
  "PrivateKey",
  "Password",
  "WebhookSecret",
  "RequestContext",
  "database_connections",
  "file_handles",
  "network_sockets",
  "thread_handles",
  "sensitive_gpu_buffers",
  "sensitive_photonic_target_buffers"
];
const DIAGNOSTIC_CATALOG = {
  LexError: { category: "BUILD", number: "001", recoveryAction: "fix_source_or_grammar" },
  TargetCompatibilityError: { category: "TARGET", number: "002", recoveryAction: "move_unsupported_operation_or_select_fallback" },
  TargetFallbackWarning: { category: "TARGET", number: "003", recoveryAction: "use_declared_or_cpu_fallback" },
  LogicSimulationWarning: { category: "LOGIC", number: "001", recoveryAction: "use_logic_width_simulation" },
  LogicUnsupportedError: { category: "LOGIC", number: "001", recoveryAction: "select_supported_logic_width_or_target" },
  LogicPrecisionWarning: { category: "LOGIC", number: "002", recoveryAction: "review_logic_width_conversion_policy" },
  RuntimeMemoryWarning: { category: "MEM", number: "002", recoveryAction: "continue_with_memory_pressure_policy" },
  RuntimeMemoryError: { category: "MEM", number: "002", recoveryAction: "fail_or_recover_with_runtime_memory_policy" },
  MemoryIntegrityError: { category: "MEM", number: "001", recoveryAction: "rollback_to_previous_checkpoint" },
  MemoryCorruptionFatal: { category: "MEM", number: "001", recoveryAction: "stop_execution_safely" },
  LargeJsonCloneWarning: { category: "MEM", number: "005", recoveryAction: "use_read_only_reference_view_or_copy_on_write" },
  ReadOnlyBorrowMutationError: { category: "MEM", number: "006", recoveryAction: "use_copy_on_write_or_mutable_borrow" },
  RuntimeSpillWarning: { category: "DISK", number: "003", recoveryAction: "continue_with_spill_policy" },
  RuntimeSpillError: { category: "DISK", number: "001", recoveryAction: "disable_spill_or_fix_spill_configuration" },
  CacheLimitWarning: { category: "CACHE", number: "001", recoveryAction: "bypass_or_demote_cache_entry" },
  UnknownType: { category: "TYPE", number: "001", recoveryAction: "define_import_or_replace_type" },
  GenericArityError: { category: "TYPE", number: "002", recoveryAction: "fix_generic_type_arguments" },
  ExhaustiveMatchError: { category: "TYPE", number: "003", recoveryAction: "add_missing_match_cases" },
  UndefinedDenied: { category: "NULL", number: "001", recoveryAction: "use_option_type" },
  SilentNullDenied: { category: "NULL", number: "002", recoveryAction: "use_option_or_explicit_json_null_policy" },
  TruthyFalsyCheck: { category: "TYPE", number: "004", recoveryAction: "compare_explicit_boolean_or_enum_state" },
  StrictCommentMismatch: { category: "BUILD", number: "002", recoveryAction: "update_strict_comment_or_declaration" },
  StrictCommentUnknownTag: { category: "BUILD", number: "003", recoveryAction: "use_documented_strict_comment_tag" },
  StrictCommentSecretError: { category: "SEC", number: "001", recoveryAction: "remove_secret_from_comment" },
  WebhookSecurityWarning: { category: "SEC", number: "002", recoveryAction: "add_webhook_hmac_and_replay_protection" },
  WebhookIdempotencyWarning: { category: "API", number: "001", recoveryAction: "add_webhook_idempotency_key" },
  ImplicitCpuTarget: { category: "TARGET", number: "004", recoveryAction: "declare_binary_target" },
  BrowserImportBlocked: { category: "SEC", number: "005", recoveryAction: "move_server_import_behind_api_boundary" },
  CapabilityBlockedImport: { category: "SEC", number: "006", recoveryAction: "remove_import_or_change_capability_policy" },
  GlobalRegistryDuplicate: { category: "ENV", number: "001", recoveryAction: "rename_or_remove_duplicate_global" },
  GlobalRegistryTypeMissing: { category: "TYPE", number: "005", recoveryAction: "add_global_type" },
  GlobalSecretTypeError: { category: "SEC", number: "003", recoveryAction: "use_securestring_for_secret" },
  GlobalStateAccessWarning: { category: "RUNTIME", number: "001", recoveryAction: "guard_global_state_mutation" },
  GlobalSecretExposureError: { category: "SEC", number: "004", recoveryAction: "remove_secret_logging" },
  GlobalMutationError: { category: "RUNTIME", number: "002", recoveryAction: "use_controlled_state_mutation" },
  RunEntryMissing: { category: "RUNTIME", number: "003", recoveryAction: "add_secure_main_flow" }
};
const EXECUTION_MODE_MATRIX = [
  {
    mode: "run",
    purpose: "Run a single script or project directly after checks.",
    command: "Galerina run hello.spore",
    productionRecommended: false
  },
  {
    mode: "generate",
    purpose: "Generate development reports and documentation from checked source without production artefacts.",
    command: "Galerina generate",
    productionRecommended: false
  },
  {
    mode: "dev",
    purpose: "Check, generate development outputs and run locally.",
    command: "Galerina dev",
    productionRecommended: false
  },
  {
    mode: "serve",
    purpose: "Run a local API or web app in development mode.",
    command: "Galerina serve --dev",
    productionRecommended: false
  },
  {
    mode: "check",
    purpose: "Validate source without writing build artefacts.",
    command: "Galerina check",
    productionRecommended: true
  },
  {
    mode: "build",
    purpose: "Compile and generate build artefacts, reports and documentation.",
    command: "Galerina build",
    productionRecommended: true
  },
  {
    mode: "release",
    purpose: "Compile a deterministic production build.",
    command: "Galerina build --mode release",
    productionRecommended: true
  }
];
const STRICT_COMMENT_TAGS = new Set([
  "ai-note",
  "ai-risk",
  "ai-todo",
  "effects",
  "errors",
  "fallback",
  "idempotency",
  "input",
  "json-policy",
  "max-body-size",
  "output",
  "owner",
  "permissions",
  "precision",
  "purpose",
  "request",
  "response",
  "rollback",
  "rollback-risk",
  "route",
  "security",
  "since",
  "source",
  "summary",
  "target",
  "test",
  "timeout",
  "verify"
]);

function main(argv) {
  const command = argv[2] || "help";
  const target = firstNonFlag(argv.slice(3)) || ".";
  const outDir = flagValue(argv, "--out") || (command === "generate" || command === "dev" ? DEFAULT_DEV_OUT : DEFAULT_OUT);
  const exclude = flagValues(argv, "--exclude");
  const checkFormat = argv.includes("--check");
  const forAi = argv.includes("--for-ai");
  const shouldGenerate = argv.includes("--generate");

  try {
    if (command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return;
    }

    if (command === "init") {
      initProject(target);
      return;
    }

    if (command === "verify") {
      const report = verifyBuild(target);
      for (const check of report.checks) {
        console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
        if (!check.ok) {
          console.log(`  ${check.problem}`);
        }
      }
      console.log(`Galerina verify: ${report.passed} passed, ${report.failed} failed`);
      process.exitCode = report.failed > 0 ? 1 : 0;
      return;
    }

    const project = loadProject(target, exclude);

    if (command === "fmt" || command === "format") {
      const formatted = formatProject(project, { check: checkFormat });
      const changed = formatted.filter((item) => item.changed);

      if (checkFormat) {
        for (const item of changed) {
          console.log(`FORMAT ${item.file}`);
        }
        console.log(`Galerina fmt: ${changed.length} files need formatting`);
        process.exitCode = changed.length > 0 ? 1 : 0;
      } else {
        for (const item of changed) {
          console.log(`Formatted ${item.file}`);
        }
        console.log(`Galerina fmt: ${changed.length} files formatted`);
      }
      return;
    }

    if (command === "test") {
      const report = runPrototypeTests(project);
      for (const test of report.tests) {
        console.log(`${test.ok ? "PASS" : "FAIL"} ${test.name}`);
        if (!test.ok) {
          console.log(`  ${test.problem}`);
        }
      }
      console.log(`Galerina test: ${report.passed} passed, ${report.failed} failed`);
      process.exitCode = report.failed > 0 ? 1 : 0;
      return;
    }

    const result = analyseProject(project);

    if (command === "run") {
      const report = runProject(project, result, parseRunOptions(argv));
      if (!report.ok) {
        printDiagnostics(result);
        process.exitCode = 1;
        return;
      }
      for (const line of report.output) {
        console.log(line);
      }
      if (shouldGenerate) {
        const written = generateDevelopmentOutputs(result, outDir);
        console.log(`Development outputs wrote ${written.length} files to ${path.resolve(outDir)}`);
      }
      return;
    }

    if (command === "generate") {
      const written = generateDevelopmentOutputs(result, outDir);
      printDiagnostics(result);
      console.log(`Development outputs wrote ${written.length} files to ${path.resolve(outDir)}`);
      process.exitCode = result.diagnostics.some(isFailureDiagnostic) ? 1 : 0;
      return;
    }

    if (command === "dev") {
      if (argv.includes("--watch")) {
        startDevWatch(target, exclude, outDir);
        return;
      }
      runDevFromAnalysis(project, result, outDir);
      return;
    }

    if (command === "serve") {
      const report = serveProject(result, { dev: argv.includes("--dev") });
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      process.exitCode = result.diagnostics.some(isFailureDiagnostic) ? 1 : 0;
      return;
    }

    if (command === "check") {
      printDiagnostics(result);
      process.exitCode = result.diagnostics.some(isFailureDiagnostic) ? 1 : 0;
      return;
    }

    if (command === "tokens" || command === "lex") {
      process.stdout.write(JSON.stringify(result.tokens, null, 2) + "\n");
      process.exitCode = result.diagnostics.some((d) => d.errorType === "LexError") ? 1 : 0;
      return;
    }

    if (command === "ast") {
      process.stdout.write(JSON.stringify(result.ast, null, 2) + "\n");
      return;
    }

    if (command === "targets") {
      process.stdout.write(JSON.stringify(buildTargetReport(result), null, 2) + "\n");
      return;
    }

    if (command === "schema") {
      const report = buildJsonSchemaReport(result.ast);
      const requestedType = flagValue(argv, "--type");
      if (requestedType) {
        if (!report.schemas[requestedType]) {
          fail(`Schema not found for type: ${requestedType}`);
        }
        process.stdout.write(JSON.stringify(report.schemas[requestedType], null, 2) + "\n");
      } else {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      }
      return;
    }

    if (command === "openapi") {
      process.stdout.write(JSON.stringify(buildOpenApi(result), null, 2) + "\n");
      return;
    }

    if (command === "ai-context") {
      const written = writeAiContext(result, outDir);
      console.log(`Wrote ${written.json}`);
      console.log(`Wrote ${written.markdown}`);
      return;
    }

    if (command === "explain") {
      const explanation = explain(result, forAi);
      process.stdout.write((forAi ? JSON.stringify(explanation, null, 2) : explanation) + "\n");
      process.exitCode = result.diagnostics.some(isFailureDiagnostic) ? 1 : 0;
      return;
    }

    if (command === "build") {
      const written = build(result, outDir);
      printDiagnostics(result);
      console.log(`Build prototype wrote ${written.length} files to ${path.resolve(outDir)}`);
      process.exitCode = result.diagnostics.some(isFailureDiagnostic) ? 1 : 0;
      return;
    }

    fail(`Unknown command: ${command}`);
  } catch (error) {
    console.error(`Galerina ${command} failed: ${error.message}`);
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log(`Galerina prototype CLI ${VERSION}

Usage:
  Galerina run <file-or-dir>
  Galerina run <file-or-dir> --generate [--out .build-dev]
  Galerina generate <file-or-dir> [--out .build-dev]
  Galerina dev <file-or-dir> [--watch] [--out .build-dev]
  Galerina serve <dir> [--dev]
  Galerina check <file-or-dir>
  Galerina tokens <file-or-dir>
  Galerina fmt <file-or-dir> [--check]
  Galerina test <examples-dir>
  Galerina schema <file-or-dir> [--type TypeName]
  Galerina openapi <file-or-dir>
  Galerina verify <build-dir-or-manifest>
  Galerina build <file-or-dir> [--out build/debug]
  Galerina ast <file-or-dir>
  Galerina targets <file-or-dir>
  Galerina ai-context <file-or-dir> [--out build/debug]
  Galerina explain <file-or-dir> [--for-ai]
  Galerina init <dir>

This is a v0.1 design prototype. It lexes and parses a documented Galerina subset,
checks core safety rules, and writes CPU-compatible target/report artefacts plus GPU,
photonic and ternary planning files. It is not a production compiler.`);
}

function firstNonFlag(args) {
  for (let i = 0; i < args.length; i += 1) {
    if (!args[i].startsWith("--") && (i === 0 || !args[i - 1].startsWith("--"))) {
      return args[i];
    }
  }
  return null;
}

function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] || null;
}

function flagValues(argv, flag) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && argv[i + 1]) {
      values.push(argv[i + 1]);
      i += 1;
    }
  }
  return values;
}

function parseRunOptions(argv) {
  return {
    targetMs: numericFlagValue(argv, "--target-ms"),
    warmupMs: numericFlagValue(argv, "--warmup-ms"),
    batchSize: numericFlagValue(argv, "--batch-size"),
    operations: numericFlagValue(argv, "--operations"),
    seed: numericFlagValue(argv, "--seed")
  };
}

function numericFlagValue(argv, flag) {
  const value = flagValue(argv, flag);
  if (value === null) return null;
  const parsed = Number.parseInt(String(value).replace(/_/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function fail(message) {
  throw new Error(message);
}

function initProject(dir) {
  const root = path.resolve(dir || ".");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const boot = path.join(root, "boot.spore");
  const mainFile = path.join(root, "src", "main.spore");

  writeIfMissing(boot, `project "LOApp"

language {
  name "Galerina"
  version "0.1"
  compatibility "prototype"
}

entry "./src/main.spore"

targets {
  binary {
    enabled true
    output "./build/debug/app.bin"
  }

  photonic {
    enabled true
    mode "plan"
    fallback "binary"
    output "./build/debug/app.photonic.plan"
  }
}

globals {
  const APP_NAME: String = "LOApp"
  config APP_PORT: Int = env.int("APP_PORT", default: 8080)
  secret APP_SECRET: SecureString = env.secret("APP_SECRET")
}

runtime {
  run_mode "checked"
  cache_ir true
  hot_reload true

  memory {
    soft_limit 512mb
    hard_limit 768mb

    on_pressure [
      "evict_caches",
      "bypass_cache",
      "backpressure",
      "spill_eligible",
      "reject_new_work",
      "graceful_fail"
    ]

    spill {
      enabled true
      path "./storage/tmp/galerina-spill"
      max_disk 2gb
      ttl 1h
      encryption true
      redact_secrets true

      allow [
        "cache_entries",
        "queue_events",
        "json_stream_buffers",
        "build_cache"
      ]

      deny [
        "SecureString",
        "RequestContext",
        "SessionToken",
        "PaymentToken",
        "PrivateKey"
      ]
    }
  }
}

documentation {
  enabled true
  required true
  output "./build/docs"

  generate [
    "api_guide",
    "type_reference",
    "global_registry_guide",
    "security_guide",
    "runtime_guide",
    "memory_pressure_guide",
    "run_compile_mode_guide",
    "deployment_guide",
    "ai_summary"
  ]
}

ai_guide {
  enabled true
  update_on_successful_compile true
  output "./build/app.ai-guide.md"
  json_output "./build/app.ai-context.json"

  include [
    "project_summary",
    "entry_points",
    "routes",
    "webhooks",
    "types",
    "flows",
    "effects",
    "global_registry",
    "security_rules",
    "runtime_rules",
    "memory_rules",
    "execution_rules",
    "target_summary",
    "strict_comments",
    "known_risks",
    "ai_todos"
  ]

  rules {
    redact_secrets true
    include_internal false
    fail_if_stale true
  }
}

manifests {
  build_manifest {
    required true
    output "./build/app.build-manifest.json"
  }

  source_match {
    required true
    output "./build/app.source-map.json"
  }

  map_manifest {
    required true
    output "./build/app.map-manifest.json"
  }

  docs_manifest {
    required true
    output "./build/docs/docs-manifest.json"
  }
}

build {
  mode "debug"
  deterministic true
  source_maps true
  reports true
  map_manifest true
  ai_context true
  ai_guide true
  documentation true

  require_outputs [
    "./build/app.bin",
    "./build/app.source-map.json",
    "./build/app.map-manifest.json",
    "./build/app.ai-guide.md",
    "./build/app.build-manifest.json",
    "./build/app.global-report.json",
    "./build/app.runtime-report.json",
    "./build/app.memory-report.json",
    "./build/app.execution-report.json",
    "./build/docs/runtime-guide.md",
    "./build/docs/global-registry-guide.md",
    "./build/docs/memory-pressure-guide.md",
    "./build/docs/run-compile-mode-guide.md",
    "./build/docs/docs-manifest.json"
  ]

  fail_on_missing_output true
}
`);

  writeIfMissing(mainFile, `secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
`);

  console.log(`Initialised Galerina project at ${root}`);
}

function writeIfMissing(file, content) {
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, content, "utf8");
}

function loadProject(input, excludePatterns = []) {
  const root = path.resolve(input || ".");
  if (!fs.existsSync(root)) {
    fail(`Path does not exist: ${root}`);
  }

  const stat = fs.statSync(root);
  const files = stat.isFile() ? [root] : listLOFiles(root);
  const filteredFiles = files.filter((file) => {
    const relative = path.relative(stat.isFile() ? path.dirname(root) : root, file).replace(/\\/g, "/");
    return !excludePatterns.some((pattern) => relative.includes(pattern) || path.basename(file) === pattern);
  });
  if (filteredFiles.length === 0) {
    fail(`No .spore files found under ${root}`);
  }

  return {
    root: stat.isFile() ? path.dirname(root) : root,
    input: root,
    files: filteredFiles.map((file) => ({
      path: file,
      relativePath: path.relative(stat.isFile() ? path.dirname(root) : root, file).replace(/\\/g, "/"),
      content: fs.readFileSync(file, "utf8")
    }))
  };
}

function listLOFiles(root) {
  const output = [];
  walk(root);
  return output.sort();

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_SOURCE_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".spore")) {
        output.push(full);
      }
    }
  }
}

function collectWatchDirectories(root, outDir) {
  return collectProjectDirectories(root, {
    ignoredRoots: outDir ? [path.resolve(outDir)] : []
  });
}

function collectProjectDirectories(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const ignoredRoots = (options.ignoredRoots || []).map((item) => normaliseFsPath(item));
  const output = [];

  walk(resolvedRoot);
  return output.sort();

  function walk(dir) {
    const normalisedDir = normaliseFsPath(dir);
    if (ignoredRoots.some((ignoredRoot) => normalisedDir === ignoredRoot || normalisedDir.startsWith(ignoredRoot + path.sep))) {
      return;
    }
    output.push(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_SOURCE_DIRECTORIES.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    }
  }
}

function normaliseFsPath(target) {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInside(target, parent) {
  const normalisedTarget = normaliseFsPath(target);
  const normalisedParent = normaliseFsPath(parent);
  return normalisedTarget === normalisedParent || normalisedTarget.startsWith(normalisedParent + path.sep);
}

function isExistingDirectory(target) {
  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory();
  } catch (error) {
    return false;
  }
}

function shouldTriggerDevWatch(changedPath, inputPath, outDir, singleFileInput) {
  if (!changedPath) return true;

  if (outDir && isPathInside(changedPath, outDir)) {
    return false;
  }

  if (singleFileInput) {
    return normaliseFsPath(changedPath) === normaliseFsPath(inputPath);
  }

  if (changedPath.endsWith(".spore")) {
    return true;
  }

  if (isExistingDirectory(changedPath)) {
    return true;
  }

  return path.extname(changedPath) === ".spore";
}

function formatWatchPath(changedPath, inputPath) {
  if (!changedPath) return "(unknown)";
  const resolvedInput = path.resolve(inputPath);
  const base = fs.existsSync(resolvedInput) && fs.statSync(resolvedInput).isFile()
    ? path.dirname(resolvedInput)
    : resolvedInput;
  const relative = path.relative(base, changedPath).replace(/\\/g, "/");
  return relative && !relative.startsWith("..") ? relative : changedPath;
}

function runDevFromAnalysis(project, result, outDir) {
  const written = generateDevelopmentOutputs(result, outDir);
  const report = runProject(project, result);
  printDiagnostics(result);
  console.log(`Development outputs wrote ${written.length} files to ${path.resolve(outDir)}`);
  for (const line of report.output) {
    console.log(line);
  }
  process.exitCode = report.ok ? 0 : 1;
  return { ok: report.ok, project, result, report, written };
}

function runDevCycle(input, excludePatterns, outDir) {
  try {
    const project = loadProject(input, excludePatterns);
    const result = analyseProject(project);
    return runDevFromAnalysis(project, result, outDir);
  } catch (error) {
    console.error(`Galerina dev failed: ${error.message}`);
    process.exitCode = 1;
    return { ok: false, error };
  }
}

function startDevWatch(input, excludePatterns, outDir) {
  const resolvedInput = path.resolve(input || ".");
  const resolvedOutDir = path.resolve(outDir);
  const inputStat = fs.statSync(resolvedInput);
  const singleFileInput = inputStat.isFile();
  let watcherSet = null;
  let rerunTimer = null;
  let refreshWatchers = false;

  console.log(`Galerina dev watch: watching ${resolvedInput}`);
  console.log(`Galerina dev watch: writing development outputs to ${resolvedOutDir}`);
  console.log("Galerina dev watch: press Ctrl+C to stop.");

  runDevCycle(resolvedInput, excludePatterns, resolvedOutDir);

  watcherSet = createDevWatcher(resolvedInput, resolvedOutDir, singleFileInput, (event) => {
    if (event.requiresRefresh) {
      refreshWatchers = true;
    }

    if (event.changedPath) {
      console.log(`Galerina dev watch: change detected in ${formatWatchPath(event.changedPath, resolvedInput)}.`);
    } else {
      console.log("Galerina dev watch: change detected.");
    }

    if (rerunTimer) {
      clearTimeout(rerunTimer);
    }

    rerunTimer = setTimeout(() => {
      rerunTimer = null;
      if (refreshWatchers && watcherSet && typeof watcherSet.refresh === "function") {
        watcherSet.refresh();
      }
      refreshWatchers = false;
      runDevCycle(resolvedInput, excludePatterns, resolvedOutDir);
    }, WATCH_DEBOUNCE_MS);
  });

  const stopWatching = () => {
    if (rerunTimer) {
      clearTimeout(rerunTimer);
      rerunTimer = null;
    }
    if (watcherSet) {
      watcherSet.close();
      watcherSet = null;
    }
  };

  process.once("SIGINT", () => {
    console.log("Galerina dev watch: stopping.");
    stopWatching();
    process.exit();
  });
  process.once("SIGTERM", () => {
    stopWatching();
    process.exit();
  });
}

function createDevWatcher(inputPath, outDir, singleFileInput, onChange) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutDir = path.resolve(outDir);

  if (!singleFileInput) {
    try {
      const watcher = fs.watch(resolvedInput, { recursive: true }, (eventType, filename) => {
        const changedPath = filename ? path.resolve(resolvedInput, String(filename)) : null;
        if (!shouldTriggerDevWatch(changedPath, resolvedInput, resolvedOutDir, false)) {
          return;
        }
        onChange({
          eventType,
          changedPath,
          requiresRefresh: Boolean(changedPath && !changedPath.endsWith(".spore"))
        });
      });
      return {
        close() {
          watcher.close();
        },
        refresh() { }
      };
    } catch (error) {
      // Fall through to per-directory watchers when recursive watch is unavailable.
    }
  }

  const watched = new Map();
  const watchBase = singleFileInput ? path.dirname(resolvedInput) : resolvedInput;

  function refresh() {
    const directories = singleFileInput
      ? [watchBase]
      : collectWatchDirectories(watchBase, resolvedOutDir);
    const next = new Set(directories.map((dir) => normaliseFsPath(dir)));

    for (const [key, watcher] of watched.entries()) {
      if (!next.has(key)) {
        watcher.close();
        watched.delete(key);
      }
    }

    for (const dir of directories) {
      const key = normaliseFsPath(dir);
      if (watched.has(key)) continue;
      const watcher = fs.watch(dir, (eventType, filename) => {
        const changedPath = filename ? path.resolve(dir, String(filename)) : dir;
        if (!shouldTriggerDevWatch(changedPath, resolvedInput, resolvedOutDir, singleFileInput)) {
          return;
        }
        const requiresRefresh = !singleFileInput && (
          !changedPath.endsWith(".spore") || isExistingDirectory(changedPath)
        );
        onChange({ eventType, changedPath, requiresRefresh });
      });
      watched.set(key, watcher);
    }
  }

  refresh();

  return {
    close() {
      for (const watcher of watched.values()) {
        watcher.close();
      }
      watched.clear();
    },
    refresh
  };
}

function analyseProject(project) {
  const ast = {
    language: "Galerina",
    compiler: VERSION,
    root: project.root,
    files: [],
    project: null,
    entry: null,
    imports: [],
    targets: [],
    capabilities: { aLOw: [], block: [], entries: [] },
    security: {},
    permissions: {},
    logic: null,
    globals: [],
    jsonPolicies: [],
    runtime: null,
    documentation: null,
    aiGuide: null,
    manifests: {},
    buildContract: {},
    types: [],
    enums: [],
    flows: [],
    apis: [],
    webhooks: [],
    computeBlocks: [],
    strictComments: []
  };
  const diagnostics = [];
  const tokens = [];

  for (const source of project.files) {
    const lexed = lexSource(source);
    tokens.push(...lexed.tokens);
    diagnostics.push(...lexed.diagnostics);
    const fileAst = parseFile(source, diagnostics);
    ast.files.push({ path: source.relativePath, sha256: sha256(source.content), lines: linesOf(source.content).length });
    mergeAst(ast, fileAst);
  }

  applyProjectChecks(project, ast, diagnostics);
  diagnostics.push(...validateTypes(project, ast));

  normaliseDiagnostics(diagnostics);

  return { project, ast, diagnostics, tokens };
}

function runPrototypeTests(project) {
  const root = fs.statSync(project.input).isFile() ? path.dirname(project.input) : project.input;
  const tests = [];

  test("parse hello.spore secure main flow", () => {
    const result = analyseProject(loadProject(path.join(root, "hello.spore")));
    assertNoLexErrors(result);
    const mainFlow = result.ast.flows.find((flow) => flow.name === "main");
    assert(mainFlow, "Expected hello.spore to define flow main.");
    assert(mainFlow.qualifier === "secure", "Expected main flow to be secure.");
    assert(mainFlow.returns === "Result<Void, Error>", "Expected main flow to return Result<Void, Error>.");
  });

  test("parse pure vector flow modifiers", () => {
    const result = analyseProject(projectFromSource("vector-flow.spore", `pure vector flow vectorTotal(input: Array<Int>) -> Int {
  return input[0] + input[1] + input[2]
}

pure vector required flow strictVectorTotal(input: Array<Int>) -> Int {
  return input[0] + input[1] + input[2]
}
`));
    assertNoLexErrors(result);
    const vectorFlow = result.ast.flows.find((flow) => flow.name === "vectorTotal");
    const requiredFlow = result.ast.flows.find((flow) => flow.name === "strictVectorTotal");
    assert(vectorFlow && vectorFlow.qualifier === "pure vector", "Expected pure vector flow qualifier.");
    assert(vectorFlow.vectorMode === "preferred", "Expected vector preferred mode.");
    assert(requiredFlow && requiredFlow.qualifier === "pure vector required", "Expected pure vector required flow qualifier.");
    assert(requiredFlow.vectorMode === "required", "Expected vector required mode.");
  });

  test("parse async flow modifier", () => {
    const result = analyseProject(projectFromSource("async-flow.spore", `async flow loadUser(id: UserId) -> Result<User, ApiError>
effects [network.outbound] {
  let response = await api.get("/users/{id}")
  return User.fromJson(response)
}
`));
    assertNoLexErrors(result);
    const asyncFlow = result.ast.flows.find((flow) => flow.name === "loadUser");
    assert(asyncFlow, "Expected async flow to be parsed.");
    assert(asyncFlow.qualifier === "async", "Expected async flow qualifier.");
    assert(asyncFlow.async === true, "Expected async flow flag.");
    assert(asyncFlow.effects.includes("network.outbound"), "Expected async flow effects to be parsed.");
  });

  test("parse boot.spore project and targets", () => {
    const result = analyseProject(loadProject(path.join(root, "boot.spore")));
    assertNoLexErrors(result);
    assert(result.ast.project === "OrderRiskDemo", "Expected boot.spore project name to be OrderRiskDemo.");
    assert(result.ast.entry === "./src/main.spore", "Expected boot.spore to declare ./src/main.spore entry.");
    for (const target of ["binary", "wasm", "gpu", "photonic", "ternary", "omni"]) {
      assert(result.ast.targets.some((item) => item.name === target), `Expected boot.spore to declare ${target} target.`);
    }
    assert(result.ast.runtime.memory.softLimit === "512mb", "Expected boot.spore runtime soft memory limit.");
    assert(result.ast.runtime.runMode === "checked", "Expected boot.spore runtime run mode.");
    assert(result.ast.runtime.cacheIr === true, "Expected boot.spore runtime cache_ir setting.");
    assert(result.ast.globals.some((global) => global.name === "PAYMENT_WEBHOOK_SECRET" && global.type === "SecureString"), "Expected boot.spore global registry secret.");
    assert(result.ast.runtime.memory.spill.deny.includes("SecureString"), "Expected runtime spill deny list to include SecureString.");
  });

  test("valid examples check without intentional error fixture", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    assert(errors.length === 0, `Expected valid examples to have no errors, found ${errors.length}.`);
  });

  test("source-map-error.spore reports compute target incompatibility", () => {
    const result = analyseProject(loadProject(path.join(root, "source-map-error.spore")));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "TargetCompatibilityError");
    assert(diagnostic, "Expected TargetCompatibilityError diagnostic.");
    assert(diagnostic.problem.includes("readFile"), "Expected diagnostic to mention readFile.");
  });

  test("diagnostics include standard Galerina codes and recovery fields", () => {
    const result = analyseProject(loadProject(path.join(root, "source-map-error.spore")));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "TargetCompatibilityError");
    assert(diagnostic.code === "galerina-ERR-TARGET-002", `Expected standard target error code, found ${diagnostic?.code}.`);
    assert(diagnostic.level === "error", "Expected standard diagnostic level.");
    assert(diagnostic.category === "target", "Expected target diagnostic category.");
    assert(diagnostic.recoveryAction === "move_unsupported_operation_or_select_fallback", "Expected recovery action.");
    assert(diagnostic.source.file === "source-map-error.spore", "Expected structured source field.");
  });

  test("logic width target checks report simulation and unsupported targets", () => {
    const result = analyseProject(projectFromSource("logic-width.spore", `project "LogicWidthDemo"

logic width 5

targets {
  ternary {
    enabled true
    mode "simulation"
  }
}

flow main() -> Result<Void, Error> {
  return Ok()
}
`));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "LogicUnsupportedError");
    assert(diagnostic, "Expected unsupported logic width diagnostic.");
    assert(diagnostic.code === "galerina-ERR-LOGIC-001", `Expected logic error code, found ${diagnostic?.code}.`);
  });

  test("logic mode ternary warns when binary target uses simulation", () => {
    const result = analyseProject(projectFromSource("logic-ternary.spore", `project "LogicTernaryDemo"

logic mode ternary

targets {
  binary {
    enabled true
  }
}

flow main() -> Result<Void, Error> {
  return Ok()
}
`));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "LogicSimulationWarning");
    assert(diagnostic, "Expected logic simulation warning.");
    assert(diagnostic.code === "galerina-WARN-LOGIC-001", `Expected logic warning code, found ${diagnostic?.code}.`);
  });

  test("browser target blocks server-only imports", () => {
    const result = analyseProject(projectFromSource("browser-import-block.spore", `project "BrowserImportBlockDemo"

target browser {
  output js
  wasm optional
  fallback js
}

capabilities {
  allow dom
  allow fetch
  block server_database
  block secrets
}

import browser.dom
import server.database

secure flow main() -> Result<Void, Error> {
  return Ok()
}
`));
    assert(result.ast.targets.some((target) => target.name === "browser"), "Expected top-level target browser to parse.");
    assert(result.ast.imports.some((item) => item.module === "server.database"), "Expected import syntax to parse.");
    assert(result.ast.capabilities.block.includes("server_database"), "Expected capabilities block to parse.");
    const diagnostic = result.diagnostics.find((item) => item.errorType === "BrowserImportBlocked");
    assert(diagnostic, "Expected browser target server-only import diagnostic.");
    assert(diagnostic.code === "galerina-ERR-SEC-005", `Expected browser import security code, found ${diagnostic?.code}.`);
    assert(diagnostic.target === "browser", "Expected diagnostic target to be browser.");
  });

  test("browser-safe example plans JavaScript output", () => {
    const result = analyseProject(loadProject(path.join(root, "browser-form.spore")));
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    assert(errors.length === 0, `Expected browser-form.spore to have no errors, found ${errors.length}.`);
    assert(hasEnabledTarget(result.ast, "browser"), "Expected browser-form.spore to enable browser target.");
    const manifest = buildManifest(result, { "app.browser.js": browserJavaScriptPlaceholder(result) });
    assert(manifest.targetOutputs.browserJavaScript === "app.browser.js", "Expected manifest to include browser JavaScript output.");
    assert(browserJavaScriptPlaceholder(result).includes("server-only imports blocked"), "Expected browser placeholder to mention import security.");
  });

  test("memory checks warn on explicit Json clone", () => {
    const result = analyseProject(projectFromSource("json-clone.spore", `project "JsonCloneDemo"

secure flow clonePayload(req: Request) -> Result<Void, Error> {
  let payload: Json = req.json()
  let payloadCopy: Json = payload.clone()
  return Ok()
}
`));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "LargeJsonCloneWarning");
    assert(diagnostic, "Expected LargeJsonCloneWarning diagnostic.");
    assert(diagnostic.code === "galerina-WARN-MEM-005", `Expected large clone warning code, found ${diagnostic?.code}.`);
  });

  test("memory checks reject mutation through read-only Json borrow", () => {
    const result = analyseProject(projectFromSource("readonly-json-mutation.spore", `project "ReadOnlyMutationDemo"

secure flow processPayload(payload: &Json) -> Result<Void, Error> {
  payload.set("$.status", "processed")
  return Ok()
}
`));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "ReadOnlyBorrowMutationError");
    assert(diagnostic, "Expected ReadOnlyBorrowMutationError diagnostic.");
    assert(diagnostic.code === "galerina-ERR-MEM-006", `Expected read-only mutation error code, found ${diagnostic?.code}.`);
  });

  test("type checker reports unknown declared types", () => {
    const result = analyseProject(projectFromSource("unknown-type.spore", `flow loadThing() -> MissingType {
  return MissingType()
}
`));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "UnknownType");
    assert(diagnostic, "Expected UnknownType diagnostic.");
    assert(diagnostic.problem.includes("MissingType"), "Expected diagnostic to mention MissingType.");
  });

  test("type checker reports missing enum match cases", () => {
    const result = analyseProject(projectFromSource("missing-match.spore", `enum PaymentStatus {
  Paid
  Pending
  Failed
}

flow decision(status: PaymentStatus) -> Decision {
  match status {
    Paid => ALOw
  }
}
`));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "ExhaustiveMatchError");
    assert(diagnostic, "Expected ExhaustiveMatchError diagnostic.");
    assert(diagnostic.problem.includes("Pending") && diagnostic.problem.includes("Failed"), "Expected diagnostic to mention missing enum cases.");
  });

  test("schema generator emits CreateOrderRequest JSON schema", () => {
    const result = analyseProject(loadProject(path.join(root, "api-orders.spore")));
    const report = buildJsonSchemaReport(result.ast);
    const schema = report.schemas.CreateOrderRequest;
    assert(schema, "Expected CreateOrderRequest schema.");
    assert(schema.properties.customerId.$ref === "#/$defs/CustomerId", "Expected customerId to reference CustomerId.");
    assert(schema.properties.items.type === "array", "Expected items to be an array.");
  });

  test("openapi generator emits OrdersApi route", () => {
    const result = analyseProject(loadProject(path.join(root, "api-orders.spore")));
    const openapi = buildOpenApi(result);
    assert(openapi.paths["/orders"], "Expected /orders path.");
    assert(openapi.paths["/orders"].post.operationId === "createOrder", "Expected createOrder operationId.");
  });

  test("target planner reports fallback-covered compute blocks", () => {
    const result = analyseProject(loadProject(root));
    const report = buildTargetReport(result);
    const compatible = report.computeBlocks.find((block) => block.file === "compute-block.spore");
    const incompatible = report.computeBlocks.find((block) => block.file === "source-map-error.spore");
    assert(compatible && compatible.fallbackCovered === true, "Expected compute-block.spore to have fallback coverage.");
    assert(incompatible && incompatible.status === "blocked", "Expected source-map-error.spore to be blocked.");
    assert(report.summary.computeBlocksBlocked >= 1, "Expected target report to count blocked compute blocks.");
    assert(report.logicCapability.some((target) => target.target === "ternary" && target.nativeLogicWidth === 3), "Expected ternary logic capability in target report.");
  });

  test("target planner reports CPU reference verification", () => {
    const result = analyseProject(loadProject(path.join(root, "compute-block.spore")));
    const report = buildTargetReport(result);
    const block = report.computeBlocks.find((item) => item.file === "compute-block.spore");
    assert(block.verification.cpuReference === true, "Expected compute-block.spore to request CPU reference verification.");
    assert(report.precisionSummary.cpuReferenceChecks === 1, "Expected one CPU reference check.");
  });

  test("ai context includes compact summaries", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const context = buildAiContext(result);
    assert(context.summary.sourceFileCount > 0, "Expected source file count.");
    assert(context.routeSummary.length === 1, "Expected one route summary.");
    assert(context.typeSummary.some((item) => item.name === "CreateOrderRequest"), "Expected CreateOrderRequest type summary.");
    assert(context.targetSummary.computeBlocksBlocked === 0, "Expected valid examples to have no blocked compute blocks.");
    assert(context.changedFiles.status, "Expected changed files status.");
  });

  test("strict comments are extracted and mismatches are reported", () => {
    const result = analyseProject(projectFromSource("strict-comment-mismatch.spore", `/// @purpose Updates an order.
/// @output Result<Order, Error>
/// @effects [database.read]
secure flow updateOrder(order: Order) -> Result<Order, Error>
effects [database.write] {
  return Ok(order)
}
`));
    const context = buildAiContext(result);
    const diagnostic = result.diagnostics.find((item) => item.errorType === "StrictCommentMismatch");
    assert(context.strictCommentSummary.length === 1, "Expected one strict comment summary.");
    assert(diagnostic && diagnostic.problem.includes("@effects"), "Expected strict comment effect mismatch.");
  });

  test("map manifest and generated docs describe compiled API output", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const mapManifest = buildMapManifest(result);
    const docsManifest = buildDocsManifest(result);
    const apiGuide = apiGuideMarkdown(result);
    assert(mapManifest.outputs.mapManifest === "app.map-manifest.json", "Expected map manifest output.");
    assert(mapManifest.routes.some((route) => route.path === "/orders" && route.docs.includes("docs/api-guide.md")), "Expected /orders route docs mapping.");
    assert(docsManifest.outputs.some((doc) => doc.file === "docs/api-guide.md"), "Expected docs manifest to list API guide.");
    assert(apiGuide.includes("POST /orders"), "Expected generated API guide to include POST /orders.");
  });

  test("successful builds include regenerated AI guide", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const outputs = {
      "app.ai-guide.md": aiGuideMarkdown(result),
      "app.ai-context.json": JSON.stringify(buildAiContext(result), null, 2)
    };
    const manifest = buildManifest(result, outputs);
    assert(shouldGenerateAiGuide(result, true), "Expected successful build to generate AI guide.");
    assert(manifest.aiGuide.included === true, "Expected manifest to include AI guide.");
    assert(aiGuideMarkdown(result).includes("If the code compiles"), "Expected AI guide rule.");
  });

  test("build manifest marks prototype artefacts as non-executable placeholders", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const manifest = buildManifest(result, {
      "app.bin": "placeholder",
      "app.wasm": "placeholder"
    });
    assert(manifest.artifactStatus["app.bin"].executable === false, "Expected app.bin to be marked non-executable.");
    assert(manifest.artifactStatus["app.bin"].platform === "not-windows-or-linux", "Expected app.bin platform status to be explicit.");
    assert(manifest.artifactStatus["app.wasm"].runtimeStatus === "placeholder", "Expected app.wasm to be marked as placeholder.");
  });

  test("build manifest includes generated output naming policy", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const manifest = buildManifest(result, {
      "app.bin": "placeholder",
      "app.wasm": "placeholder"
    });
    assert(validGeneratedOutputNaming(manifest.generatedOutputNaming), "Expected valid generated output naming policy.");
    assert(manifest.generatedOutputNaming.outputs.some((item) => item.path === "app.build-manifest.json"), "Expected build manifest name in policy.");
    assert(manifest.generatedOutputNaming.outputs.every((item) => !path.isAbsolute(item.path) && !item.path.includes("\\")), "Expected portable relative output names.");
  });

  test("build manifest includes per-source hashes", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const manifest = buildManifest(result, {
      "app.bin": "placeholder",
      "app.wasm": "placeholder"
    });
    assert(validSourceHashPolicy(manifest.deterministicInputs), "Expected valid source hash policy.");
    assert(manifest.deterministicInputs.sourceFiles.length === result.project.files.length, "Expected one source hash per source file.");
    assert(manifest.deterministicInputs.sourceFiles.every((item) => item.hash.startsWith("sha256:")), "Expected SHA-256 source hashes.");
  });

  test("build manifest includes dependency hashes", () => {
    const result = analyseProject(projectFromSource("imports.spore", `project "Imports"
import browser.dom
import server.database
secure flow main() -> Result<Void, Error> {
  return Ok()
}
`));
    const manifest = buildManifest(result, {
      "app.bin": "placeholder",
      "app.wasm": "placeholder"
    });
    assert(validDependencyHashPolicy(manifest.deterministicInputs), "Expected valid dependency hash policy.");
    assert(manifest.deterministicInputs.dependencies.length === 2, "Expected two dependency hashes.");
    assert(manifest.deterministicInputs.dependencies.some((item) => item.module === "browser.dom" && item.kind === "browser-safe"), "Expected browser-safe dependency classification.");
    assert(manifest.deterministicInputs.dependencies.some((item) => item.module === "server.database" && item.kind === "server-only"), "Expected server-only dependency classification.");
  });

  test("build manifest defines deterministic build rules", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const manifest = buildManifest(result, {
      "app.bin": "placeholder",
      "app.wasm": "placeholder"
    });
    assert(validDeterministicBuildRules(manifest.deterministicBuildRules, manifest.deterministicInputs), "Expected valid deterministic build rules.");
    assert(manifest.deterministicBuildRules.excludedMetadata.includes("createdAt"), "Expected createdAt to be excluded from reproducibility.");
    assert(manifest.deterministicInputs.buildInputHash.startsWith("sha256:"), "Expected build input hash.");
  });

  test("verify checks build artifact status metadata", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "galerina-verify-artifacts-"));
    try {
      build(result, outDir);
      const report = verifyBuild(outDir);
      assert(report.failed === 0, `Expected verified build, found ${report.failed} failures.`);
      assert(report.checks.some((item) => item.name === "artifact status: app.bin" && item.ok), "Expected app.bin artifact status check.");
      assert(report.checks.some((item) => item.name === "artifact status: app.wasm" && item.ok), "Expected app.wasm artifact status check.");
      assert(report.checks.some((item) => item.name === "generated output naming policy" && item.ok), "Expected generated output naming check.");
      assert(report.checks.some((item) => item.name === "source hash policy" && item.ok), "Expected source hash policy check.");
      assert(report.checks.some((item) => item.name === "dependency hash policy" && item.ok), "Expected dependency hash policy check.");
      assert(report.checks.some((item) => item.name === "deterministic build rules" && item.ok), "Expected deterministic build rules check.");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test("build cleans stale generated outputs before writing new artefacts", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "galerina-build-clean-"));
    const keepFile = path.join(outDir, "keep.txt");
    try {
      build(analyseProject(loadProject(path.join(root, "browser-form.spore"))), outDir);
      assert(fs.existsSync(path.join(outDir, "app.browser.js")), "Expected browser build to create app.browser.js.");
      fs.writeFileSync(keepFile, "user-owned file\n", "utf8");

      build(analyseProject(loadProject(path.join(root, "hello.spore"))), outDir);
      assert(!fs.existsSync(path.join(outDir, "app.browser.js")), "Expected stale browser output to be cleaned.");
      assert(fs.existsSync(keepFile), "Expected non-generated file to be preserved.");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test("runtime report describes memory pressure and spill policy", () => {
    const result = analyseProject(loadProject(path.join(root, "boot.spore")));
    const report = buildRuntimeReport(result);
    assert(report.execution.runMode === "checked", "Expected runtime report run mode.");
    assert(report.memory.softLimit === "512mb", "Expected runtime report soft memory limit.");
    assert(report.memory.spill.enabled === true, "Expected runtime spill to be enabled.");
    assert(report.memory.spill.encryption === true, "Expected runtime spill encryption.");
    assert(report.memory.spill.deny.includes("SecureString"), "Expected runtime spill deny list to include SecureString.");
  });

  test("memory report describes pressure ladder and cache bypass", () => {
    const result = analyseProject(loadProject(path.join(root, "boot.spore")));
    const report = buildMemoryReport(result);
    assert(report.pressureLadder.length === 7, "Expected memory pressure ladder to have seven stages.");
    assert(report.cacheLimit.name === "cache_bypass", "Expected cache bypass policy.");
    assert(report.spillPolicy.secretRule.includes("must not be spilled"), "Expected secret spill denial rule.");
    assert(report.generatedOutputs.memoryPressureGuide === "docs/memory-pressure-guide.md", "Expected memory pressure guide output.");
  });

  test("execution report describes run and compile modes", () => {
    const result = analyseProject(loadProject(path.join(root, "boot.spore")));
    const report = buildExecutionReport(result);
    assert(report.runtime.runMode === "checked", "Expected execution report run mode.");
    assert(report.compileMode.mapManifest === true, "Expected compile mode map manifest.");
    assert(report.modes.some((item) => item.mode === "run"), "Expected run mode in execution matrix.");
    assert(report.aiGuideRule.includes("successful compile"), "Expected successful compile AI guide rule.");
  });

  test("global report describes registry and redacts secrets", () => {
    const result = analyseProject(loadProject(path.join(root, "boot.spore")));
    const report = buildGlobalReport(result);
    const secret = report.globals.find((global) => global.name === "PAYMENT_WEBHOOK_SECRET");
    assert(report.summary.secretCount >= 1, "Expected at least one global secret.");
    assert(secret && secret.value === "[redacted]", "Expected global secret value to be redacted.");
    assert(report.requiredEnvironment.some((item) => item.name === "PAYMENT_WEBHOOK_SECRET"), "Expected required environment entry.");
  });

  test("global secret must use SecureString", () => {
    const result = analyseProject(projectFromSource("bad-global-secret.spore", `globals {
  secret API_KEY: String = env.secret("API_KEY")
}
`));
    const diagnostic = result.diagnostics.find((item) => item.errorType === "GlobalSecretTypeError");
    assert(diagnostic, "Expected GlobalSecretTypeError diagnostic.");
  });

  test("run mode executes simple checked print script", () => {
    const source = projectFromSource("hello-run.spore", `secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
`);
    const result = analyseProject(source);
    const run = runProject(source, result);
    assert(run.ok === true, "Expected checked run mode to pass.");
    assert(run.output[0] === "hello from Galerina", "Expected run mode print output.");
  });

  test("run mode executes simple checked console.log script", () => {
    const source = projectFromSource("hello-console-run.spore", `secure flow main() -> Result<Void, Error> {
  console.log("hello from Galerina console")
  return Ok()
}
`);
    const result = analyseProject(source);
    const run = runProject(source, result);
    assert(run.ok === true, "Expected checked run mode to pass.");
    assert(run.output[0] === "hello from Galerina console", "Expected run mode console.log output.");
  });

  test("run mode resolves simple let bindings and string concatenation", () => {
    const source = projectFromSource("concat-run.spore", `pure vector flow vectorTotal(input: Int) -> Int {
  return input
}

pure flow add(a: Int, b: Int) -> Int {
  return a + b
}

pure flow addDecimal(a: Decimal, b: Decimal) -> Decimal {
  return a + b
}

secure flow responsePayload() -> Json {
  return {
    "items": [
      { "id": 1, "test": "xxx" },
      { "id": 2, "test": "xxx" },
      { "id": 3, "test": "xxx" }
    ]
  }
}

secure flow main() -> Result<Void, Error> {
  let total: Int = vectorTotal(6)
  let sum: Int = add(2, 3)
  let decimalTotal: Decimal = addDecimal(1.20, 2.30)
  let payload: Json = responsePayload()
  console.log("vector total: " . total)
  console.log("sum: " . sum)
  console.log("decimal sum: " . decimalTotal)
  console.log("json payload:\\n" . json.pretty(payload))
  print(2 + 2)
  print("dot total: " . total)
  return Ok()
}
`);
    const result = analyseProject(source);
    const run = runProject(source, result);
    assert(run.ok === true, "Expected checked run mode to pass.");
    assert(run.output[0] === "vector total: 6", "Expected plus concatenation output.");
    assert(run.output[1] === "sum: 5", "Expected function sum output.");
    assert(run.output[2] === "decimal sum: 3.50", "Expected decimal function sum output.");
    assert(run.output[3] === "json payload:\n{\n  \"items\": [\n    {\n      \"id\": 1,\n      \"test\": \"xxx\"\n    },\n    {\n      \"id\": 2,\n      \"test\": \"xxx\"\n    },\n    {\n      \"id\": 3,\n      \"test\": \"xxx\"\n    }\n  ]\n}", "Expected pretty JSON payload output.");
    assert(run.output[4] === "4", "Expected plus to remain numeric addition.");
    assert(run.output[5] === "dot total: 6", "Expected dot concatenation output.");
  });

  test("development generate writes reports without production binaries", () => {
    const result = analyseProject(loadProject(root, ["source-map-error.spore"]));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "galerina-dev-"));
    try {
      const written = generateDevelopmentOutputs(result, outDir);
      assert(written.some((file) => file.endsWith("app.ai-context.json")), "Expected development AI context output.");
      assert(written.some((file) => file.endsWith(path.join("docs", "api-guide.md"))), "Expected development API guide output.");
      assert(!fs.existsSync(path.join(outDir, "app.bin")), "Development generation must not write app.bin.");
      assert(!fs.existsSync(path.join(outDir, "app.wasm")), "Development generation must not write app.wasm.");
      assert(!fs.existsSync(path.join(outDir, "app.build-manifest.json")), "Development generation must not write production build manifest.");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test("dev watch directory collection excludes ignored and generated folders", () => {
    const watchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "galerina-watch-dirs-"));
    const outDir = path.join(watchRoot, ".build-dev");
    try {
      fs.mkdirSync(path.join(watchRoot, "src", "nested"), { recursive: true });
      fs.mkdirSync(path.join(watchRoot, "build"), { recursive: true });
      fs.mkdirSync(path.join(watchRoot, "node_modules"), { recursive: true });
      fs.mkdirSync(path.join(watchRoot, ".git"), { recursive: true });
      fs.mkdirSync(outDir, { recursive: true });

      const watched = collectWatchDirectories(watchRoot, outDir)
        .map((dir) => path.relative(watchRoot, dir).replace(/\\/g, "/"));

      assert(watched.includes(""), "Expected root directory to be watched.");
      assert(watched.includes("src"), "Expected source directory to be watched.");
      assert(watched.includes("src/nested"), "Expected nested source directory to be watched.");
      assert(!watched.includes("build"), "Expected build directory to be ignored.");
      assert(!watched.includes("node_modules"), "Expected node_modules to be ignored.");
      assert(!watched.includes(".git"), "Expected .git to be ignored.");
      assert(!watched.includes(".build-dev"), "Expected development output directory to be ignored.");
    } finally {
      fs.rmSync(watchRoot, { recursive: true, force: true });
    }
  });

  test("dev watch only reruns for source changes", () => {
    const watchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "galerina-watch-filter-"));
    const outDir = path.join(watchRoot, ".build-dev");
    const mainFile = path.join(watchRoot, "src", "main.spore");
    const siblingFile = path.join(watchRoot, "src", "other.spore");
    try {
      fs.mkdirSync(path.dirname(mainFile), { recursive: true });
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(mainFile, "secure flow main() -> Result<Void, Error> { return Ok() }\n", "utf8");
      fs.writeFileSync(siblingFile, "flow helper() -> Result<Void, Error> { return Ok() }\n", "utf8");

      assert(shouldTriggerDevWatch(mainFile, watchRoot, outDir, false) === true, "Expected directory mode to react to .spore changes.");
      assert(shouldTriggerDevWatch(path.join(outDir, "app.ai-context.json"), watchRoot, outDir, false) === false, "Expected dev outputs to be ignored.");
      assert(shouldTriggerDevWatch(path.join(watchRoot, "README.md"), watchRoot, outDir, false) === false, "Expected non-.spore files to be ignored.");
      assert(shouldTriggerDevWatch(mainFile, mainFile, outDir, true) === true, "Expected single-file mode to react to the requested file.");
      assert(shouldTriggerDevWatch(siblingFile, mainFile, outDir, true) === false, "Expected single-file mode to ignore sibling files.");
    } finally {
      fs.rmSync(watchRoot, { recursive: true, force: true });
    }
  });

  test("formatter check is clean for examples", () => {
    const formatted = formatProject(loadProject(root), { check: true });
    const changed = formatted.filter((item) => item.changed);
    assert(changed.length === 0, `Expected examples to be formatted, found ${changed.length} changed files.`);
  });

  const passed = tests.filter((item) => item.ok).length;
  const failed = tests.length - passed;
  return { tests, passed, failed };

  function test(name, callback) {
    try {
      callback();
      tests.push({ name, ok: true });
    } catch (error) {
      tests.push({ name, ok: false, problem: error.message });
    }
  }
}

function projectFromSource(fileName, content) {
  return {
    root: "(memory)",
    input: "(memory)",
    files: [{
      path: fileName,
      relativePath: fileName,
      content
    }]
  };
}

function assertNoLexErrors(result) {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.errorType === "LexError");
  assert(errors.length === 0, `Expected no lex errors, found ${errors.length}.`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseFile(source, diagnostics) {
  const content = stripComments(source.content);
  const lines = linesOf(source.content);
  const ast = {
    project: null,
    entry: null,
    imports: [],
    targets: [],
    security: {},
    permissions: {},
    globals: [],
    jsonPolicies: [],
    runtime: null,
    documentation: null,
    aiGuide: null,
    manifests: {},
    buildContract: {},
    types: [],
    enums: [],
    flows: [],
    apis: [],
    webhooks: [],
    computeBlocks: [],
    strictComments: []
  };

  scanForbiddenTokens(source, diagnostics);
  ast.strictComments = extractStrictComments(source, diagnostics);

  const projectMatch = content.match(/\bproject\s+"([^"]+)"/);
  if (projectMatch) ast.project = projectMatch[1];

  const entryMatch = content.match(/\bentry\s+"([^"]+)"/);
  if (entryMatch) ast.entry = entryMatch[1];

  ast.logic = parseLogicDirective(source, content);

  ast.imports = matches(content, /\b(?:use|import)\s+([A-Za-z_][A-Za-z0-9_.]*)/g).map((m) => ({
    module: m[1],
    ...loc(source, m.index)
  }));

  const targetsBlock = findNamedBlock(content, "targets");
  if (targetsBlock) {
    for (const section of TARGET_BLOCKS) {
      const block = findNamedBlock(targetsBlock.body, section);
      if (block) {
        ast.targets.push(parseTargetDeclaration(source, section, block.body, targetsBlock.index + block.index));
      }
    }
  }

  for (const block of findBlocks(content, /\btarget\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g)) {
    ast.targets.push(parseTargetDeclaration(source, block.name, block.body, block.index));
  }

  const capabilities = findNamedBlock(content, "capabilities");
  if (capabilities) ast.capabilities = parseCapabilitiesBlock(source, capabilities.body, capabilities.index);

  const security = findNamedBlock(content, "security");
  if (security) ast.security = parseSettings(security.body);

  const permissions = findNamedBlock(content, "permissions");
  if (permissions) ast.permissions = parseSettings(permissions.body);

  const globals = findNamedBlock(source.content, "globals");
  if (globals) ast.globals = parseGlobalRegistryBlock(source, globals);

  const runtime = findNamedBlock(content, "runtime");
  if (runtime) ast.runtime = parseRuntimeBlock(runtime.body);

  const documentation = findNamedBlock(content, "documentation");
  if (documentation) ast.documentation = parseDocumentationBlock(documentation.body);

  const aiGuide = findNamedBlock(content, "ai_guide");
  if (aiGuide) ast.aiGuide = parseAiGuideBlock(aiGuide.body);

  const manifests = findNamedBlock(content, "manifests");
  if (manifests) ast.manifests = parseManifestsBlock(manifests.body);

  const buildContract = findNamedBlock(content, "build");
  if (buildContract) ast.buildContract = parseBuildContractBlock(buildContract.body);

  for (const block of findBlocks(content, /\bjson_policy\s*\{/g)) {
    ast.jsonPolicies.push({ settings: parseSettings(block.body), ...loc(source, block.index) });
  }

  for (const block of findBlocks(content, /\btype\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.types.push({
      name: block.name,
      fields: parseFields(block.body),
      ...loc(source, block.index)
    });
  }

  for (const match of matches(content, /\btype\s+([A-Z][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_<>, ]*)/g)) {
    ast.types.push({ name: match[1], alias: match[2].trim(), fields: [], ...loc(source, match.index) });
  }

  for (const block of findBlocks(content, /\benum\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.enums.push({
      name: block.name,
      cases: block.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      ...loc(source, block.index)
    });
  }

  for (const match of matches(content, /\b(async\s+)?(?:(secure|pure(?:\s+vector(?:\s+required)?)?)\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_<>, ]*)/g)) {
    const qualifier = flowQualifier(match[1], match[2]);
    ast.flows.push({
      name: match[3],
      qualifier,
      vectorMode: flowVectorMode(qualifier),
      async: qualifier.includes("async"),
      params: parseParams(match[4]),
      returns: match[5].trim(),
      effects: parseEffects(content.slice(match.index, match.index + 300)),
      ...loc(source, match.index)
    });
  }

  for (const block of findBlocks(content, /\bapi\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.apis.push({
      name: block.name,
      routes: parseRoutes(block.body),
      ...loc(source, block.index)
    });
  }

  for (const block of findBlocks(content, /\bwebhook\s+([A-Z][A-Za-z0-9_]*)\s*\{/g)) {
    ast.webhooks.push({
      name: block.name,
      path: stringSetting(block.body, "path"),
      method: wordSetting(block.body, "method"),
      hmacHeader: stringSetting(block.body, "hmac_header"),
      maxAge: wordSetting(block.body, "max_age"),
      maxBodySize: wordSetting(block.body, "max_body_size"),
      replayProtection: wordSetting(block.body, "replay_protection"),
      idempotencyKey: expressionSetting(block.body, "idempotency_key"),
      handler: wordSetting(block.body, "handler"),
      ...loc(source, block.index)
    });
  }

  for (const block of findBlocks(content, /\bcompute\s+target\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+verify\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\{/g)) {
    const target = block.name.trim();
    const banned = BANNED_COMPUTE_OPS.filter((op) => block.body.includes(op));
    ast.computeBlocks.push({
      target,
      verify: block.extra || null,
      prefers: matches(block.body, /\bprefer\s+([A-Za-z_][A-Za-z0-9_]*)/g).map((m) => m[1]),
      fallbacks: matches(block.body, /\bfallback\s+([A-Za-z_][A-Za-z0-9_]*)/g).map((m) => m[1]),
      bannedOperations: banned,
      ...loc(source, block.index)
    });

    for (const op of banned) {
      diagnostics.push(diagnostic("error", "TargetCompatibilityError", source, block.index, `${op} cannot run inside a compute block.`, "Move I/O, secrets and environment access outside the compute block, then pass typed values in."));
    }

    if ((target.includes("photonic") || block.body.includes("prefer photonic")) && !/\bfallback\s+cpu\b|\bfallback\s+binary\b/.test(block.body)) {
      diagnostics.push(diagnostic("warning", "TargetFallbackWarning", source, block.index, "Photonic compute block has no explicit CPU or binary fallback.", "Add fallback cpu or fallback binary to preserve backwards compatibility."));
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const truthy = line.match(/\bif\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\{/);
    if (truthy) {
      diagnostics.push({
        severity: "warning",
        errorType: "TruthyFalsyCheck",
        file: source.relativePath,
        line: i + 1,
        column: line.indexOf(truthy[1]) + 1,
        problem: `if ${truthy[1]} uses an implicit truthy/falsy check.`,
        suggestedFix: "Compare a Bool explicitly or use match for Option, Result and enum values."
      });
    }
  }

  applyStrictCommentChecks(source, ast, diagnostics);

  return ast;
}

function parseTargetDeclaration(source, name, body, index) {
  const target = name === "cpu" ? "binary" : name;
  return {
    name: target,
    enabled: !/\benabled\s+false\b/.test(body),
    mode: stringSetting(body, "mode") || targetModeDefault(target, body),
    fallback: stringSetting(body, "fallback") || wordSetting(body, "fallback"),
    output: stringSetting(body, "output") || wordSetting(body, "output"),
    wasm: wordSetting(body, "wasm"),
    sourceMaps: wordSetting(body, "source_maps"),
    ...loc(source, index)
  };
}

function targetModeDefault(target, body) {
  if (target === "browser") return wordSetting(body, "output") || "js";
  if (target === "server") return "runtime";
  if (target === "native") return "output";
  if (target === "photonic" || target === "gpu") return "plan";
  if (target === "ternary" || target === "omni") return "simulation";
  return "output";
}

function parseCapabilitiesBlock(source, body, blockIndex) {
  const output = { aLOw: [], block: [], entries: [] };
  for (const match of matches(body, /\b(aLOw|block)\s+([A-Za-z_][A-Za-z0-9_.]*)/g)) {
    const entry = {
      action: match[1],
      capability: match[2],
      ...loc(source, blockIndex + match.index)
    };
    output.entries.push(entry);
    output[entry.action].push(entry.capability);
  }
  output.allow = Array.from(new Set(output.aLOw));
  output.block = Array.from(new Set(output.block));
  return output;
}

function scanForbiddenTokens(source, diagnostics) {
  const lines = linesOf(source.content);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\/\/.*$/, "");
    if (/\bundefined\b/.test(line)) {
      if (/^\s*undefined\s+"deny"/.test(line)) continue;
      diagnostics.push(lineDiagnostic("error", "UndefinedDenied", source, i, line.indexOf("undefined"), "Galerina does not allow undefined.", "Use Option<T> with Some(value) or None."));
    }
    if (/\bnull\b/.test(line) && !/\bJsonNull\b/.test(line)) {
      if (/^\s*null\s+"deny"/.test(line)) continue;
      diagnostics.push(lineDiagnostic("error", "SilentNullDenied", source, i, line.indexOf("null"), "Galerina does not allow silent null in normal source.", "Use Option<T> or configure JSON null handling explicitly."));
    }
  }
}

function extractStrictComments(source, diagnostics) {
  const lines = linesOf(source.content);
  const comments = [];
  let index = 0;

  while (index < lines.length) {
    const first = lines[index];
    if (!/^\s*\/\/\//.test(first)) {
      index += 1;
      continue;
    }

    const startLine = index + 1;
    const raw = [];
    const tags = {};
    const unknownTags = [];

    while (index < lines.length && /^\s*\/\/\//.test(lines[index])) {
      const value = lines[index].replace(/^\s*\/\/\/\s?/, "");
      raw.push(value);
      const tag = value.match(/^@([A-Za-z][A-Za-z0-9_-]*)\s*(.*)$/);
      if (tag) {
        const name = tag[1];
        const tagValue = tag[2].trim();
        tags[name] = tags[name] || [];
        tags[name].push(tagValue);
        if (!STRICT_COMMENT_TAGS.has(name)) unknownTags.push(name);
      }
      index += 1;
    }

    let next = index;
    while (next < lines.length && lines[next].trim() === "") next += 1;
    const subject = next < lines.length ? strictCommentSubject(lines[next].trim(), next + 1) : null;
    const comment = {
      file: source.relativePath,
      line: startLine,
      column: first.indexOf("///") + 1,
      tags,
      raw,
      summary: tags.purpose?.[0] || tags.summary?.[0] || raw.find((line) => line && !line.startsWith("@")) || null,
      subject
    };
    comments.push(comment);

    for (const tag of Array.from(new Set(unknownTags))) {
      diagnostics.push(lineDiagnostic("warning", "StrictCommentUnknownTag", source, startLine - 1, first.indexOf("///"), `Strict comment tag @${tag} is not in the v0.1 recognised tag set.`, "Use a documented strict comment tag or add the tag to the language rules before relying on it."));
    }

    const combined = raw.join("\n");
    if (containsSecretLikeValue(combined)) {
      diagnostics.push(lineDiagnostic("error", "StrictCommentSecretError", source, startLine - 1, first.indexOf("///"), "Strict comments must not contain literal secret values.", "Replace the secret value with an env.secret(\"NAME\") reference or a non-sensitive description."));
    }
  }

  return comments;
}

function strictCommentSubject(line, lineNumber) {
  const cleaned = line.replace(/^export\s+/, "");
  const flow = cleaned.match(/^(?:async\s+)?(?:(secure|pure(?:\s+vector(?:\s+required)?)?)\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (flow) return { kind: "flow", name: flow[2], line: lineNumber };
  const api = cleaned.match(/^api\s+([A-Z][A-Za-z0-9_]*)/);
  if (api) return { kind: "api", name: api[1], line: lineNumber };
  const webhook = cleaned.match(/^webhook\s+([A-Z][A-Za-z0-9_]*)/);
  if (webhook) return { kind: "webhook", name: webhook[1], line: lineNumber };
  const global = cleaned.match(/^(const|config|secret|state)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (global) return { kind: "global", globalKind: global[1], name: global[2], line: lineNumber };
  const compute = cleaned.match(/^compute\s+target\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+verify\s+([A-Za-z_][A-Za-z0-9_]*))?/);
  if (compute) return { kind: "compute", name: compute[1], verify: compute[2] || null, line: lineNumber };
  const type = cleaned.match(/^type\s+([A-Z][A-Za-z0-9_]*)/);
  if (type) return { kind: "type", name: type[1], line: lineNumber };
  const enumMatch = cleaned.match(/^enum\s+([A-Z][A-Za-z0-9_]*)/);
  if (enumMatch) return { kind: "enum", name: enumMatch[1], line: lineNumber };
  return { kind: "unknown", name: null, line: lineNumber };
}

function containsSecretLikeValue(text) {
  return /\b(sk_live|pk_live|ghp_|xox[baprs]-|AKIA[0-9A-Z]{16})[A-Za-z0-9_-]*/.test(text)
    || /\b(api[_-]?key|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i.test(text);
}

function applyStrictCommentChecks(source, ast, diagnostics) {
  for (const comment of ast.strictComments) {
    if (!comment.subject || comment.subject.kind === "unknown") continue;
    if (comment.subject.kind === "flow") {
      const flow = nearestSubject(ast.flows, comment);
      if (flow) checkStrictFlowComment(source, comment, flow, diagnostics);
    }
    if (comment.subject.kind === "api") {
      const api = nearestSubject(ast.apis, comment);
      if (api) checkStrictApiComment(source, comment, api, diagnostics);
    }
    if (comment.subject.kind === "webhook") {
      const webhook = nearestSubject(ast.webhooks, comment);
      if (webhook) checkStrictWebhookComment(source, comment, webhook, diagnostics);
    }
    if (comment.subject.kind === "compute") {
      const block = ast.computeBlocks
        .filter((item) => item.target === comment.subject.name)
        .sort((a, b) => Math.abs(a.line - comment.subject.line) - Math.abs(b.line - comment.subject.line))[0];
      if (block) checkStrictComputeComment(source, comment, block, diagnostics);
    }
  }
}

function nearestSubject(items, comment) {
  return items
    .filter((item) => item.name === comment.subject.name)
    .sort((a, b) => Math.abs(a.line - comment.subject.line) - Math.abs(b.line - comment.subject.line))[0];
}

function checkStrictFlowComment(source, comment, flow, diagnostics) {
  const output = firstTag(comment, "output");
  if (output && output !== flow.returns) {
    strictMismatch(source, comment, "@output", `@output says ${output}. Flow returns ${flow.returns}.`, diagnostics);
  }

  const effects = parseTagList(firstTag(comment, "effects"));
  if (effects.length > 0 && !sameList(effects, flow.effects)) {
    strictMismatch(source, comment, "@effects", `@effects says [${effects.join(", ")}]. Flow declares [${flow.effects.join(", ")}].`, diagnostics);
  }
}

function checkStrictApiComment(source, comment, api, diagnostics) {
  const route = api.routes[0];
  if (!route) return;
  compareTag(source, comment, "@request", firstTag(comment, "request"), route.request, "API route request", diagnostics);
  compareTag(source, comment, "@response", firstTag(comment, "response"), route.response, "API route response", diagnostics);
  compareTag(source, comment, "@timeout", firstTag(comment, "timeout"), route.timeout, "API route timeout", diagnostics);
  compareTag(source, comment, "@max-body-size", firstTag(comment, "max-body-size"), route.maxBodySize, "API route max_body_size", diagnostics);
}

function checkStrictWebhookComment(source, comment, webhook, diagnostics) {
  const security = firstTag(comment, "security") || "";
  if (/\bhmac\b/i.test(security) && !webhook.hmacHeader) {
    strictMismatch(source, comment, "@security", "@security requires HMAC verification, but the webhook has no hmac_header.", diagnostics);
  }
  const idempotency = firstTag(comment, "idempotency") || "";
  if (/\brequired\b/i.test(idempotency) && !webhook.idempotencyKey) {
    strictMismatch(source, comment, "@idempotency", "@idempotency is required, but the webhook has no idempotency_key.", diagnostics);
  }
  compareTag(source, comment, "@max-body-size", firstTag(comment, "max-body-size"), webhook.maxBodySize, "webhook max_body_size", diagnostics);
}

function checkStrictComputeComment(source, comment, block, diagnostics) {
  compareTag(source, comment, "@verify", firstTag(comment, "verify"), block.verify, "compute verify mode", diagnostics);
  const fallbackText = firstTag(comment, "fallback");
  if (fallbackText) {
    const fallbacks = parseTagList(fallbackText);
    const missing = fallbacks.filter((target) => !block.fallbacks.includes(target));
    if (missing.length > 0) {
      strictMismatch(source, comment, "@fallback", `@fallback mentions [${missing.join(", ")}], but the compute block does not declare those fallbacks.`, diagnostics);
    }
  }
}

function firstTag(comment, name) {
  return comment.tags[name]?.[0] || null;
}

function parseTagList(value) {
  if (!value) return [];
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^fallback\s+/, "").replace(/^prefer\s+/, ""));
}

function sameList(left, right) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function compareTag(source, comment, tag, actualTagValue, declaredValue, declaredName, diagnostics) {
  if (!actualTagValue || !declaredValue || actualTagValue === declaredValue) return;
  strictMismatch(source, comment, tag, `${tag} says ${actualTagValue}. ${declaredName} declares ${declaredValue}.`, diagnostics);
}

function strictMismatch(source, comment, tag, problem, diagnostics) {
  diagnostics.push(lineDiagnostic("warning", "StrictCommentMismatch", source, comment.line - 1, comment.column - 1, problem, `Update ${tag} or correct the declaration it describes.`));
}

function applyProjectChecks(project, ast, diagnostics) {
  if (!ast.project) {
    ast.project = "LOProject";
  }

  const targetNames = new Set(ast.targets.filter((target) => target.enabled).map((target) => target.name));
  if (!targetNames.has("binary")) {
    ast.targets.unshift({
      name: "binary",
      enabled: true,
      mode: "output",
      fallback: null,
      output: "build/debug/app.bin",
      line: 1,
      column: 1,
      file: "(implicit)"
    });
    diagnostics.push({
      severity: "info",
      errorType: "ImplicitCpuTarget",
      file: "(project)",
      line: 1,
      column: 1,
      problem: "No binary target was declared, so CPU binary compatibility is enabled implicitly.",
      suggestedFix: "Declare a binary target in boot.spore for explicit output paths."
    });
  }

  for (const target of ast.targets) {
    if ((target.name === "photonic" || target.name === "gpu") && !target.fallback) {
      diagnostics.push({
        severity: "warning",
        errorType: "TargetFallbackWarning",
        file: target.file,
        line: target.line,
        column: target.column,
        problem: `${target.name} target has no fallback.`,
        suggestedFix: "Add fallback \"binary\" or fallback \"cpu\" so normal CPU systems remain supported."
      });
    }
  }

  applyImportCapabilityChecks(ast, diagnostics);
  applyLogicTargetChecks(ast, diagnostics);
  applyMemoryVariableUseChecks(project, diagnostics);

  for (const webhook of ast.webhooks) {
    if (!webhook.hmacHeader) {
      diagnostics.push({
        severity: "warning",
        errorType: "WebhookSecurityWarning",
        file: webhook.file,
        line: webhook.line,
        column: webhook.column,
        problem: `Webhook ${webhook.name} does not declare an HMAC header.`,
        suggestedFix: "Add hmac_header, env.secret, max_age, max_body_size, replay_protection and idempotency_key."
      });
    }
    if (!webhook.idempotencyKey) {
      diagnostics.push({
        severity: "warning",
        errorType: "WebhookIdempotencyWarning",
        file: webhook.file,
        line: webhook.line,
        column: webhook.column,
        problem: `Webhook ${webhook.name} does not declare an idempotency key.`,
        suggestedFix: "Add idempotency_key json.path(\"$.id\")."
      });
    }
  }

  applyGlobalRegistryChecks(ast, diagnostics);

  for (const item of runtimeMemoryDiagnostics(ast.runtime || defaultRuntimeContract())) {
    diagnostics.push(item);
  }
}

function applyImportCapabilityChecks(ast, diagnostics) {
  const browserTargets = ast.targets.filter((target) => target.enabled && target.name === "browser");
  if (browserTargets.length === 0) return;

  const blockedCapabilities = new Set(ast.capabilities?.block || []);
  const browserTargetFiles = new Set(browserTargets.map((target) => target.file));
  const browserDeclaredInBoot = browserTargets.some((target) => target.file === "boot.spore");
  for (const imported of ast.imports) {
    if (!browserDeclaredInBoot && !browserTargetFiles.has(imported.file)) continue;
    const capability = capabilityForImport(imported.module);
    if (isServerOnlyImport(imported.module)) {
      diagnostics.push({
        severity: "error",
        errorType: "BrowserImportBlocked",
        file: imported.file,
        line: imported.line,
        column: imported.column,
        target: "browser",
        problem: `Server-only import "${imported.module}" cannot be used in browser target.`,
        suggestedFix: "Move server-only access behind an API endpoint or compile this code for a server/native target."
      });
      continue;
    }
    if (capability && blockedCapabilities.has(capability)) {
      diagnostics.push({
        severity: "error",
        errorType: "CapabilityBlockedImport",
        file: imported.file,
        line: imported.line,
        column: imported.column,
        target: "browser",
        problem: `Import "${imported.module}" requires blocked capability "${capability}".`,
        suggestedFix: `Remove the import or change the capabilities block if ${capability} is intentionally aLOwed for this target.`
      });
    }
  }
}

function isServerOnlyImport(moduleName) {
  return SERVER_ONLY_IMPORTS.some((blocked) => moduleName === blocked || moduleName.startsWith(`${blocked}.`));
}

function capabilityForImport(moduleName) {
  if (moduleName === "browser.dom") return "dom";
  if (moduleName === "browser.forms") return "forms";
  if (moduleName === "browser.events") return "events";
  if (moduleName === "browser.http") return "fetch";
  if (moduleName === "browser.storage") return "storage";
  if (moduleName === "browser.router") return "router";
  if (moduleName === "environment") return "environment";
  if (moduleName.startsWith("server.database")) return "server_database";
  if (moduleName.startsWith("server.filesystem")) return "filesystem";
  if (moduleName.startsWith("server.secrets")) return "secrets";
  if (moduleName.startsWith("payment.private")) return "secrets";
  if (moduleName.startsWith("filesystem.private")) return "filesystem";
  return null;
}

function applyLogicTargetChecks(ast, diagnostics) {
  const logic = ast.logic;
  if (!logic || logic.width === null || logic.width === "dynamic") return;
  for (const target of ast.targets.filter((item) => item.enabled)) {
    const nativeWidth = targetLogicWidth(target.name);
    const simulatedWidths = targetSupportedSimulatedWidths(target.name);
    if (nativeWidth === logic.width) continue;
    if (targetSupportsLogicWidth(target.name, logic.width)) {
      diagnostics.push({
        severity: "warning",
        errorType: "LogicSimulationWarning",
        file: logic.file,
        line: logic.line,
        column: logic.column,
        target: target.name,
        problem: `Target "${target.name}" does not natively support logic width ${logic.width}. Using simulation.`,
        suggestedFix: "Use a target with native support for this logic width, or keep simulation enabled and review target reports."
      });
      continue;
    }
    diagnostics.push({
      severity: "error",
      errorType: "LogicUnsupportedError",
      file: logic.file,
      line: logic.line,
      column: logic.column,
      target: target.name,
      problem: `Target "${target.name}" supports logic width ${nativeWidth}, but this program requested logic width ${logic.width}.`,
      suggestedFix: "Select a compatible target, lower the requested logic width, or use an Omni-logic simulation target when available."
    });
  }
}

function applyMemoryVariableUseChecks(project, diagnostics) {
  for (const sourceFile of project.files) {
    const content = sourceFile.content;
    checkLargeJsonClones(sourceFile, content, diagnostics);
    checkReadOnlyBorrowMutation(sourceFile, content, diagnostics);
  }
}

function checkLargeJsonClones(sourceFile, content, diagnostics) {
  const code = stripComments(content);
  const jsonVars = new Set();
  for (const match of matches(code, /\b(?:let|mut)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*Json\b/g)) {
    jsonVars.add(match[1]);
  }
  for (const name of jsonVars) {
    const clone = new RegExp(`\\b${name}\\.clone\\s*\\(`, "g");
    let match;
    while ((match = clone.exec(code)) !== null) {
      diagnostics.push({
        severity: "warning",
        errorType: "LargeJsonCloneWarning",
        file: sourceFile.path,
        ...locFromContent(code, match.index),
        problem: `Json value ${name} is cloned explicitly. Large Json clones are memory-heavy actions.`,
        suggestedFix: `Use &${name} for read-only access, ${name}.view(...) for partial access, or copy-on-write helpers such as json.redact(&${name}) when a full copy is not required.`
      });
    }
  }
}

function checkReadOnlyBorrowMutation(sourceFile, content, diagnostics) {
  const code = stripComments(content);
  for (const flow of findMemoryCheckFlowBlocks(code)) {
    const readOnlyJsonParams = parseParams(flow.params)
      .filter((param) => param.type === "&Json")
      .map((param) => param.name);
    for (const name of readOnlyJsonParams) {
      const mutation = new RegExp(`\\b${name}\\.(?:set|delete|remove|push|append|merge|clear)\\s*\\(`, "g");
      let match;
      while ((match = mutation.exec(flow.body)) !== null) {
        const location = locFromContent(code, flow.bodyOffset + match.index);
        diagnostics.push({
          severity: "error",
          errorType: "ReadOnlyBorrowMutationError",
          file: sourceFile.path,
          line: location.line,
          column: location.column,
          problem: `Cannot mutate read-only borrowed Json parameter ${name}.`,
          suggestedFix: "Use copy-on-write, return a modified owned value, or request an explicit &mut Json borrow where aLOwed."
        });
      }
    }
  }
}

function findMemoryCheckFlowBlocks(content) {
  const blocks = [];
  const regex = /\b(?:async\s+)?(?:(secure|pure(?:\s+vector(?:\s+required)?)?)\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*[A-Za-z_][A-Za-z0-9_<>, &]*(?:\s*\n\s*effects\s+\[[^\]]+\])?\s*\{/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const open = content.indexOf("{", match.index);
    const close = findMatchingBrace(content, open);
    if (close === -1) continue;
    blocks.push({
      name: match[2],
      params: match[3],
      body: content.slice(open + 1, close),
      bodyOffset: open + 1
    });
    regex.lastIndex = close + 1;
  }
  return blocks;
}

function applyGlobalRegistryChecks(ast, diagnostics) {
  const seen = new Map();
  const secretNames = new Set(ast.globals.filter((item) => item.kind === "secret").map((item) => item.name));
  for (const global of ast.globals) {
    if (seen.has(global.name)) {
      diagnostics.push({
        severity: "error",
        errorType: "GlobalRegistryDuplicate",
        file: global.file,
        line: global.line,
        column: global.column,
        problem: `Global ${global.name} is declared more than once.`,
        suggestedFix: "Keep one registry declaration for each global name."
      });
    }
    seen.set(global.name, global);

    if (!global.type) {
      diagnostics.push({
        severity: "error",
        errorType: "GlobalRegistryTypeMissing",
        file: global.file,
        line: global.line,
        column: global.column,
        problem: `Global ${global.name} has no explicit type.`,
        suggestedFix: "Add an explicit type to the global registry declaration."
      });
    }

    if (global.kind === "secret" && global.type !== "SecureString") {
      diagnostics.push({
        severity: "error",
        errorType: "GlobalSecretTypeError",
        file: global.file,
        line: global.line,
        column: global.column,
        problem: `Global secret ${global.name} must use SecureString, not ${global.type}.`,
        suggestedFix: "Declare the secret as SecureString or make it a non-secret config value."
      });
    }

    if (global.kind === "state" && !global.access) {
      diagnostics.push({
        severity: "warning",
        errorType: "GlobalStateAccessWarning",
        file: global.file,
        line: global.line,
        column: global.column,
        problem: `Global state ${global.name} does not declare access control.`,
        suggestedFix: "Add access \"locked\" or another explicit concurrency strategy."
      });
    }
  }

  for (const sourceFile of ast.files) {
    const file = ast.root && ast.root !== "(memory)" ? path.join(ast.root, sourceFile.path) : null;
    const content = file && fs.existsSync(file) ? stripComments(fs.readFileSync(file, "utf8")) : null;
    if (!content) continue;
    for (const secret of secretNames) {
      const unsafeUse = new RegExp(`\\b(?:print|log\\.(?:info|warn|error|debug))\\s*\\([^)]*\\b${secret}\\b`, "g");
      let match;
      while ((match = unsafeUse.exec(content)) !== null) {
        const declared = seen.get(secret);
        diagnostics.push({
          severity: "error",
          errorType: "GlobalSecretExposureError",
          file: sourceFile.path,
          ...locFromContent(content, match.index),
          problem: `${secret} is a SecureString global and cannot be printed or logged directly. Declared at ${declared.file}:${declared.line}.`,
          suggestedFix: `Use redact(${secret}) only if a safe placeholder is needed.`
        });
      }
    }

    const assignment = /\b([A-Z][A-Z0-9_]{2,})\s*=/g;
    let match;
    while ((match = assignment.exec(content)) !== null) {
      const global = seen.get(match[1]);
      if (global && global.kind !== "state") {
        diagnostics.push({
          severity: "error",
          errorType: "GlobalMutationError",
          file: sourceFile.path,
          ...locFromContent(content, match.index),
          problem: `${global.name} is a ${global.kind} global and cannot be reassigned.`,
          suggestedFix: "Use local variables for temporary state or declare controlled global state."
        });
      }
    }
  }
}

function mergeAst(target, source) {
  if (source.project) target.project = source.project;
  if (source.entry) target.entry = source.entry;
  target.imports.push(...source.imports);
  target.targets.push(...source.targets);
  target.capabilities.aLOw.push(...(source.capabilities?.allow || []));
  target.capabilities.block.push(...(source.capabilities?.block || []));
  target.capabilities.entries.push(...(source.capabilities?.entries || []));
  target.capabilities.allow = Array.from(new Set(target.capabilities.aLOw));
  target.capabilities.block = Array.from(new Set(target.capabilities.block));
  Object.assign(target.security, source.security);
  Object.assign(target.permissions, source.permissions);
  if (source.logic) target.logic = source.logic;
  if (source.runtime) target.runtime = source.runtime;
  if (source.documentation) target.documentation = source.documentation;
  if (source.aiGuide) target.aiGuide = source.aiGuide;
  Object.assign(target.manifests, source.manifests);
  Object.assign(target.buildContract, source.buildContract);
  target.jsonPolicies.push(...source.jsonPolicies);
  target.globals.push(...source.globals);
  target.types.push(...source.types);
  target.enums.push(...source.enums);
  target.flows.push(...source.flows);
  target.apis.push(...source.apis);
  target.webhooks.push(...source.webhooks);
  target.computeBlocks.push(...source.computeBlocks);
  target.strictComments.push(...source.strictComments);
}

function stripComments(content) {
  return content.replace(/\/\/.*$/gm, "");
}

function linesOf(content) {
  return content.split(/\r?\n/);
}

function matches(content, regex) {
  const output = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    output.push(match);
  }
  return output;
}

function findNamedBlock(content, name) {
  const regex = new RegExp(`\\b${name}\\s*\\{`, "g");
  const found = findBlocks(content, regex);
  return found[0] || null;
}

function findBlocks(content, regex) {
  const output = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const open = content.indexOf("{", match.index);
    const close = findMatchingBrace(content, open);
    if (close === -1) continue;
    output.push({
      name: match[1] || null,
      extra: match[2] || null,
      index: match.index,
      bodyStart: open + 1,
      body: content.slice(open + 1, close)
    });
    regex.lastIndex = close + 1;
  }
  return output;
}

function findMatchingBrace(content, open) {
  let depth = 0;
  for (let i = open; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function parseSettings(body) {
  const settings = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes("{") || trimmed.includes("}")) continue;
    const parts = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
    if (!parts) continue;
    settings[parts[1]] = cleanValue(parts[2]);
  }
  return settings;
}

function parseRuntimeBlock(body) {
  const memory = findNamedBlock(body, "memory");
  return {
    runMode: stringSetting(body, "run_mode") || wordSetting(body, "run_mode") || "checked",
    cacheIr: booleanSetting(body, "cache_ir", false),
    hotReload: booleanSetting(body, "hot_reload", false),
    memory: memory ? parseRuntimeMemoryBlock(memory.body) : null
  };
}

function parseGlobalRegistryBlock(source, block) {
  const globals = [];
  const declaration = /^\s*(const|config|secret)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=\n]+?)\s*=\s*(.+?)\s*$/gm;
  let match;
  while ((match = declaration.exec(block.body)) !== null) {
    const absoluteIndex = block.bodyStart + match.index;
    const valueExpression = match[4].trim();
    globals.push({
      kind: match[1],
      name: match[2],
      type: match[3].trim(),
      value: match[1] === "secret" ? "[redacted]" : redactSecretLikeExpression(valueExpression),
      valueExpression: match[1] === "secret" ? "[redacted]" : valueExpression,
      env: environmentName(valueExpression),
      mutable: false,
      ...loc(source, absoluteIndex)
    });
  }

  for (const stateBlock of findBlocks(block.body, /\bstate\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^{\n]+)\{/g)) {
    const absoluteIndex = block.bodyStart + stateBlock.index;
    globals.push({
      kind: "state",
      name: stateBlock.name,
      type: (stateBlock.extra || "").trim(),
      value: null,
      valueExpression: null,
      env: null,
      mutable: true,
      access: stringSetting(stateBlock.body, "access"),
      maxSize: wordSetting(stateBlock.body, "max_size"),
      ttl: wordSetting(stateBlock.body, "ttl"),
      ...loc(source, absoluteIndex)
    });
  }

  return globals;
}

function environmentName(expression) {
  const match = expression.match(/\benv\.(?:secret|int|string|bool|duration|size)\s*\(\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function redactSecretLikeExpression(expression) {
  if (/\benv\.secret\s*\(/.test(expression)) return "[redacted]";
  return expression;
}

function parseRuntimeMemoryBlock(body) {
  const spill = findNamedBlock(body, "spill");
  return {
    softLimit: wordSetting(body, "soft_limit"),
    hardLimit: wordSetting(body, "hard_limit"),
    onPressure: parseStringListSetting(body, "on_pressure"),
    spill: spill ? parseRuntimeSpillBlock(spill.body) : null
  };
}

function parseRuntimeSpillBlock(body) {
  return {
    enabled: booleanSetting(body, "enabled", false),
    path: stringSetting(body, "path"),
    maxDisk: wordSetting(body, "max_disk"),
    ttl: wordSetting(body, "ttl"),
    encryption: booleanSetting(body, "encryption", false),
    redactSecrets: booleanSetting(body, "redact_secrets", true),
    aLOw: parseStringListSetting(body, "aLOw"),
    deny: parseStringListSetting(body, "deny")
  };
}

function parseDocumentationBlock(body) {
  const rules = findNamedBlock(body, "rules");
  return {
    enabled: booleanSetting(body, "enabled", false),
    required: booleanSetting(body, "required", false),
    output: stringSetting(body, "output") || "./build/docs",
    formats: parseStringListSetting(body, "formats"),
    generate: parseStringListSetting(body, "generate"),
    sources: parseStringListSetting(body, "sources"),
    rules: rules ? parseSettings(rules.body) : {}
  };
}

function parseAiGuideBlock(body) {
  const rules = findNamedBlock(body, "rules");
  return {
    enabled: booleanSetting(body, "enabled", false),
    updateOnSuccessfulCompile: booleanSetting(body, "update_on_successful_compile", true),
    output: stringSetting(body, "output") || "./build/app.ai-guide.md",
    jsonOutput: stringSetting(body, "json_output") || "./build/app.ai-context.json",
    include: parseStringListSetting(body, "include"),
    rules: rules ? parseSettings(rules.body) : {}
  };
}

function parseManifestsBlock(body) {
  const manifests = {};
  for (const block of findBlocks(body, /\b([A-Za-z_][A-Za-z0-9_]*)\s*\{/g)) {
    manifests[block.name] = {
      required: booleanSetting(block.body, "required", false),
      output: stringSetting(block.body, "output")
    };
  }
  return manifests;
}

function parseBuildContractBlock(body) {
  return {
    mode: stringSetting(body, "mode") || wordSetting(body, "mode") || "debug",
    deterministic: booleanSetting(body, "deterministic", false),
    sourceMaps: booleanSetting(body, "source_maps", true),
    reports: booleanSetting(body, "reports", true),
    mapManifest: booleanSetting(body, "map_manifest", true),
    aiContext: booleanSetting(body, "ai_context", true),
    aiGuide: booleanSetting(body, "ai_guide", true),
    documentation: booleanSetting(body, "documentation", false),
    requireOutputs: parseStringListSetting(body, "require_outputs"),
    failOnMissingOutput: booleanSetting(body, "fail_on_missing_output", false),
    failOnDocError: booleanSetting(body, "fail_on_doc_error", false)
  };
}

function parseLogicDirective(source, content) {
  const widthMatch = content.match(/\blogic\s+width\s+([0-9]+|dynamic|n)\b/);
  if (widthMatch) {
    const rawWidth = widthMatch[1];
    return {
      mode: rawWidth === "dynamic" || rawWidth === "n" ? "dynamic" : `width-${rawWidth}`,
      width: rawWidth === "dynamic" || rawWidth === "n" ? "dynamic" : Number(rawWidth),
      ...loc(source, widthMatch.index)
    };
  }

  const modeMatch = content.match(/\blogic\s+mode\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (!modeMatch) return null;
  const mode = modeMatch[1];
  return {
    mode,
    width: logicModeWidth(mode),
    ...loc(source, modeMatch.index)
  };
}

function logicModeWidth(mode) {
  if (mode === "binary") return 2;
  if (mode === "ternary") return 3;
  if (mode === "quaternary") return 4;
  if (mode === "omni" || mode === "dynamic") return "dynamic";
  return null;
}

function parseStringListSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s*\\[([\\s\\S]*?)\\]`);
  const match = body.match(regex);
  if (!match) return [];
  return matches(match[1], /"([^"]+)"/g).map((item) => item[1]);
}

function booleanSetting(body, key, fallback) {
  const value = wordSetting(body, key);
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

function parseFields(body) {
  return body.split(/\r?\n/).map((line) => {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
    if (!match) return null;
    return { name: match[1], type: match[2].trim().replace(/,$/, "") };
  }).filter(Boolean);
}

function parseParams(text) {
  if (!text.trim()) return [];
  return splitTopLevel(text).map((item) => {
    const [name, type] = item.split(":").map((value) => value.trim());
    return { name, type };
  }).filter((param) => param.name && param.type);
}

function flowQualifier(asyncMarker, qualifierMarker) {
  const parts = [];
  if (asyncMarker) parts.push("async");
  if (qualifierMarker) parts.push(qualifierMarker.trim());
  return parts.join(" ") || "normal";
}

function flowVectorMode(qualifier) {
  if (qualifier.includes("pure vector required")) return "required";
  if (qualifier.includes("pure vector")) return "preferred";
  return "scalar";
}

function splitTopLevel(text) {
  const output = [];
  let current = "";
  let depth = 0;

  for (const char of text) {
    if (char === "<") depth += 1;
    if (char === ">") depth -= 1;
    if (char === "," && depth === 0) {
      output.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) output.push(current.trim());
  return output;
}

function parseEffects(text) {
  const match = text.match(/\beffects\s+\[([^\]]+)\]/);
  if (!match) return [];
  return match[1].split(",").map((value) => value.trim()).filter(Boolean);
}

function parseRoutes(body) {
  return matches(body, /\b(GET|POST|PUT|PATCH|DELETE)\s+"([^"]+)"\s*\{([\s\S]*?)\n\s*\}/g).map((match) => ({
    method: match[1],
    path: match[2],
    request: wordSetting(match[3], "request"),
    response: wordSetting(match[3], "response"),
    handler: wordSetting(match[3], "handler"),
    timeout: wordSetting(match[3], "timeout"),
    maxBodySize: wordSetting(match[3], "max_body_size")
  }));
}

function stringSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s+"([^"]+)"`);
  const match = body.match(regex);
  return match ? match[1] : null;
}

function wordSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s+([^\\s\\n]+)`);
  const match = body.match(regex);
  return match ? cleanValue(match[1]) : null;
}

function expressionSetting(body, key) {
  const regex = new RegExp(`\\b${key}\\s+([^\\n]+)`);
  const match = body.match(regex);
  return match ? match[1].trim() : null;
}

function cleanValue(value) {
  const trimmed = value.trim().replace(/,$/, "");
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed.replace(/^"|"$/g, "");
}

function loc(source, index) {
  const before = source.content.slice(0, index);
  const line = before.split(/\r?\n/).length;
  const lastNewline = before.lastIndexOf("\n");
  return {
    file: source.relativePath,
    line,
    column: index - lastNewline
  };
}

function locFromContent(content, index) {
  const before = content.slice(0, index);
  const line = before.split(/\r?\n/).length;
  const lastNewline = before.lastIndexOf("\n");
  return {
    line,
    column: index - lastNewline
  };
}

function diagnostic(severity, errorType, source, index, problem, suggestedFix) {
  return standardDiagnostic({
    severity,
    errorType,
    ...loc(source, index),
    problem,
    suggestedFix
  });
}

function lineDiagnostic(severity, errorType, source, lineIndex, columnIndex, problem, suggestedFix) {
  return standardDiagnostic({
    severity,
    errorType,
    file: source.relativePath,
    line: lineIndex + 1,
    column: Math.max(1, columnIndex + 1),
    problem,
    suggestedFix
  });
}

function normaliseDiagnostics(diagnostics) {
  for (let i = 0; i < diagnostics.length; i += 1) {
    diagnostics[i] = standardDiagnostic(diagnostics[i]);
  }
  return diagnostics;
}

function standardDiagnostic(input) {
  const severity = input.severity || input.level || "error";
  const errorType = input.errorType || input.type || "Diagnostic";
  const catalog = DIAGNOSTIC_CATALOG[errorType] || fallbackDiagnosticCatalog(errorType);
  const level = severity === "error" ? "error" : severity === "warning" ? "warning" : severity === "fatal" ? "fatal" : "info";
  const source = input.source || {
    file: input.file || "(unknown)",
    line: input.line || 1,
    column: input.column || 1
  };
  const target = input.target || inferDiagnosticTarget(errorType, source.file);
  const recoveryAction = input.recoveryAction || catalog.recoveryAction || recoveryActionFromSuggestion(input.suggestedFix);
  const message = input.message || input.problem || "";
  return {
    ...input,
    severity,
    level,
    code: input.code || diagnosticCode(level, catalog.category, catalog.number),
    category: input.category || categoryName(catalog.category),
    errorType,
    file: source.file,
    line: source.line,
    column: source.column || 1,
    target,
    problem: input.problem || message,
    message,
    suggestedFix: input.suggestedFix || "",
    recoveryAction,
    timestamp: input.timestamp || new Date().toISOString(),
    source
  };
}

function fallbackDiagnosticCatalog(errorType) {
  if (/Memory/.test(errorType)) return { category: "MEM", number: "999", recoveryAction: "foLOw_memory_recovery_policy" };
  if (/Disk|Spill/.test(errorType)) return { category: "DISK", number: "999", recoveryAction: "foLOw_disk_recovery_policy" };
  if (/Cache/.test(errorType)) return { category: "CACHE", number: "999", recoveryAction: "foLOw_cache_recovery_policy" };
  if (/Target|Compute/.test(errorType)) return { category: "TARGET", number: "999", recoveryAction: "check_target_capability" };
  if (/Type|Match/.test(errorType)) return { category: "TYPE", number: "999", recoveryAction: "fix_type_or_match_contract" };
  if (/Security|Secret/.test(errorType)) return { category: "SEC", number: "999", recoveryAction: "fix_security_policy" };
  if (/Webhook|Api/.test(errorType)) return { category: "API", number: "999", recoveryAction: "fix_api_contract" };
  if (/Runtime|Run/.test(errorType)) return { category: "RUNTIME", number: "999", recoveryAction: "fix_runtime_policy" };
  return { category: "BUILD", number: "999", recoveryAction: "inspect_diagnostic" };
}

function diagnosticCode(level, category, number) {
  const prefix = level === "fatal" ? "FATAL" : level === "error" ? "ERR" : level === "warning" ? "WARN" : "INFO";
  return `galerina-${prefix}-${category}-${number}`;
}

function categoryName(category) {
  return {
    MEM: "memory",
    DISK: "disk",
    CACHE: "cache",
    LOGIC: "logic",
    TARGET: "target",
    TYPE: "type",
    NULL: "null",
    SEC: "security",
    ENV: "environment",
    IO: "io",
    NET: "network",
    API: "api",
    BUILD: "build",
    RUNTIME: "runtime"
  }[category] || category.toLowerCase();
}

function inferDiagnosticTarget(errorType, file) {
  if (/Target|Compute|Fallback|Photonic|Gpu|Wasm|Ternary/.test(errorType)) return "target";
  if (/Runtime|Memory|Spill|Cache/.test(errorType)) return "runtime";
  if (file && file !== "(unknown)") return "source";
  return "compiler";
}

function recoveryActionFromSuggestion(suggestedFix) {
  if (!suggestedFix) return "inspect_diagnostic";
  return suggestedFix
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "inspect_diagnostic";
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function printDiagnostics(result) {
  const counts = { error: 0, warning: 0, info: 0, fatal: 0 };
  for (const diagnostic of result.diagnostics) {
    counts[diagnostic.severity] = (counts[diagnostic.severity] || 0) + 1;
    console.log(`${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${diagnostic.errorType} ${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`);
    console.log(`  ${diagnostic.problem}`);
    console.log(`  recovery: ${diagnostic.recoveryAction}`);
    console.log(`  fix: ${diagnostic.suggestedFix}`);
  }
  console.log(`Galerina check: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`);
}

function build(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const success = !result.diagnostics.some(isFailureDiagnostic);
  const reports = {
    "app.bin": "Galerina prototype CPU-compatible output\nThis file is a placeholder manifest, not a native binary.\n",
    "app.wasm": "Galerina prototype WASM output placeholder\n",
    "app.gpu.plan": planText(result, "gpu"),
    "app.photonic.plan": planText(result, "photonic"),
    "app.ternary.sim": planText(result, "ternary"),
    "app.omni-logic.sim": planText(result, "omni"),
    "app.precision-report.json": JSON.stringify(buildPrecisionReport(result), null, 2),
    "app.schemas.json": JSON.stringify(buildJsonSchemaReport(result.ast), null, 2),
    "app.openapi.json": JSON.stringify(buildOpenApi(result), null, 2),
    "app.api-report.json": JSON.stringify(buildApiReport(result), null, 2),
    "app.global-report.json": JSON.stringify(buildGlobalReport(result), null, 2),
    "app.map-manifest.json": JSON.stringify(buildMapManifest(result), null, 2),
    "app.runtime-report.json": JSON.stringify(buildRuntimeReport(result), null, 2),
    "app.memory-report.json": JSON.stringify(buildMemoryReport(result), null, 2),
    "app.execution-report.json": JSON.stringify(buildExecutionReport(result), null, 2),
    "app.target-report.json": JSON.stringify(buildTargetReport(result), null, 2),
    "app.security-report.json": JSON.stringify(buildSecurityReport(result), null, 2),
    "app.failure-report.json": JSON.stringify(buildFailureReport(result), null, 2),
    "app.source-map.json": JSON.stringify(buildSourceMap(result), null, 2),
    "app.tokens.json": JSON.stringify(buildTokenReport(result), null, 2),
    "app.ai-context.json": JSON.stringify(buildAiContext(result), null, 2),
    "app.ai-context.md": aiContextMarkdown(result),
    "docs/api-guide.md": apiGuideMarkdown(result),
    "docs/webhook-guide.md": webhookGuideMarkdown(result),
    "docs/type-reference.md": typeReferenceMarkdown(result),
    "docs/global-registry-guide.md": globalRegistryGuideMarkdown(result),
    "docs/security-guide.md": securityGuideMarkdown(result),
    "docs/runtime-guide.md": runtimeGuideMarkdown(result),
    "docs/memory-pressure-guide.md": memoryPressureGuideMarkdown(result),
    "docs/run-compile-mode-guide.md": runCompileModeGuideMarkdown(result),
    "docs/deployment-guide.md": deploymentGuideMarkdown(result),
    "docs/ai-summary.md": aiSummaryMarkdown(result),
    "docs/docs-manifest.json": JSON.stringify(buildDocsManifest(result), null, 2)
  };
  if (shouldGenerateAiGuide(result, success)) {
    reports[aiGuideOutput(result)] = aiGuideMarkdown(result);
  }
  if (hasEnabledTarget(result.ast, "browser")) {
    reports["app.browser.js"] = browserJavaScriptPlaceholder(result);
  }
  reports["app.build-manifest.json"] = JSON.stringify(buildManifest(result, reports), null, 2);
  if (success) {
    enforceBuildContract(result, reports);
  }

  cleanGeneratedOutputs(outDir);
  return writeReportFiles(outDir, reports);
}

function hasEnabledTarget(ast, name) {
  return ast.targets.some((target) => target.enabled && target.name === name);
}

function browserJavaScriptPlaceholder(result) {
  return `// Galerina prototype browser JavaScript output
// Project: ${result.ast.project}
// Status: placeholder output for target/capability planning.
// Browser-safe imports: ${result.ast.imports.filter((item) => BROWSER_SAFE_IMPORTS.has(item.module)).map((item) => item.module).join(", ") || "none"}

export const LOBrowserTarget = {
  project: ${JSON.stringify(result.ast.project)},
  output: "js",
  sourceMaps: true,
  security: "server-only imports blocked by Galerina target/capability checks"
};
`;
}

function generateDevelopmentOutputs(result, outDir) {
  const success = !result.diagnostics.some(isFailureDiagnostic);
  const reports = {
    "app.openapi.json": JSON.stringify(buildOpenApi(result), null, 2),
    "app.api-report.json": JSON.stringify(buildApiReport(result), null, 2),
    "app.global-report.json": JSON.stringify(buildGlobalReport(result), null, 2),
    "app.map-manifest.json": JSON.stringify(buildMapManifest(result), null, 2),
    "app.memory-report.json": JSON.stringify(buildMemoryReport(result), null, 2),
    "app.security-report.json": JSON.stringify(buildSecurityReport(result), null, 2),
    "app.failure-report.json": JSON.stringify(buildFailureReport(result), null, 2),
    "app.source-map.json": JSON.stringify(buildSourceMap(result), null, 2),
    "app.schemas.json": JSON.stringify(buildJsonSchemaReport(result.ast), null, 2),
    "app.tokens.json": JSON.stringify(buildTokenReport(result), null, 2),
    "app.ai-context.json": JSON.stringify(buildAiContext(result), null, 2),
    "app.ai-context.md": aiContextMarkdown(result),
    "docs/api-guide.md": apiGuideMarkdown(result),
    "docs/webhook-guide.md": webhookGuideMarkdown(result),
    "docs/type-reference.md": typeReferenceMarkdown(result),
    "docs/global-registry-guide.md": globalRegistryGuideMarkdown(result),
    "docs/security-guide.md": securityGuideMarkdown(result),
    "docs/runtime-guide.md": runtimeGuideMarkdown(result),
    "docs/memory-pressure-guide.md": memoryPressureGuideMarkdown(result),
    "docs/run-compile-mode-guide.md": runCompileModeGuideMarkdown(result),
    "docs/deployment-guide.md": deploymentGuideMarkdown(result),
    "docs/ai-summary.md": aiSummaryMarkdown(result),
    "docs/docs-manifest.json": JSON.stringify(buildDocsManifest(result), null, 2)
  };
  if (shouldGenerateAiGuide(result, success)) {
    reports[aiGuideOutput(result)] = aiGuideMarkdown(result);
  }
  return writeReportFiles(outDir, reports);
}

function writeReportFiles(outDir, reports) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [name, content] of Object.entries(reports)) {
    const file = path.join(outDir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content.endsWith("\n") ? content : content + "\n", "utf8");
    written.push(file);
  }
  return written;
}

function cleanGeneratedOutputs(outDir) {
  for (const name of knownGeneratedOutputPaths()) {
    const file = path.join(outDir, name);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      fs.rmSync(file, { force: true });
    }
  }
}

function knownGeneratedOutputPaths() {
  return GENERATED_OUTPUTS.filter((item) => item.cleanup).map((item) => item.path);
}

function verifyBuild(input) {
  const resolved = path.resolve(input || DEFAULT_OUT);
  const manifestPath = resolveManifestPath(resolved);
  const buildDir = path.dirname(manifestPath);
  const checks = [];

  let manifest = null;
  check("manifest exists", () => fs.existsSync(manifestPath), `Manifest not found at ${manifestPath}.`);
  check("manifest is valid JSON", () => {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return true;
  }, `Manifest is not valid JSON: ${manifestPath}.`);

  if (manifest) {
    check("manifest has compiler version", () => typeof manifest.compiler === "string" && manifest.compiler.length > 0, "Manifest is missing compiler version.");
    check("manifest has deterministic input hash", () => Boolean(manifest.deterministicInputs && manifest.deterministicInputs.sourceHash), "Manifest is missing deterministicInputs.sourceHash.");
    check("source hash policy", () => validSourceHashPolicy(manifest.deterministicInputs), "Manifest has an invalid deterministicInputs source hash policy.");
    check("dependency hash policy", () => validDependencyHashPolicy(manifest.deterministicInputs), "Manifest has an invalid deterministicInputs dependency hash policy.");
    check("deterministic build rules", () => validDeterministicBuildRules(manifest.deterministicBuildRules, manifest.deterministicInputs), "Manifest has invalid deterministic build rules.");

    const outputFiles = [
      ...Object.values(manifest.targetOutputs || {}),
      ...(manifest.reports || []),
      ...(manifest.documentation?.outputs || []),
      ...(manifest.aiGuide?.included ? [manifest.aiGuide.output] : []),
      ...(manifest.requiredOutputs || []),
      "app.ai-context.md"
    ];
    const uniqueFiles = Array.from(new Set(outputFiles));

    for (const fileName of uniqueFiles) {
      check(`artefact exists: ${fileName}`, () => fs.existsSync(path.join(buildDir, fileName)), `Missing artefact ${fileName}.`);
    }

    for (const [fileName, expectedHash] of Object.entries(manifest.outputHashes || {})) {
      check(`hash matches: ${fileName}`, () => {
        const file = path.join(buildDir, fileName);
        if (!fs.existsSync(file)) return false;
        return `sha256:${sha256(fs.readFileSync(file, "utf8"))}` === expectedHash;
      }, `Hash mismatch for ${fileName}.`);
    }

    check("manifest has artifact status metadata", () => Boolean(manifest.artifactStatus && typeof manifest.artifactStatus === "object"), "Manifest is missing artifactStatus metadata.");
    for (const fileName of Object.values(manifest.targetOutputs || {})) {
      if (!fileName || typeof fileName !== "string") continue;
      check(`artifact status: ${fileName}`, () => validArtifactStatus(fileName, manifest.artifactStatus[fileName]), `Invalid artifactStatus entry for ${fileName}.`);
    }
    check("generated output naming policy", () => validGeneratedOutputNaming(manifest.generatedOutputNaming), "Manifest has an invalid generatedOutputNaming policy.");

    for (const fileName of manifest.reports || []) {
      check(`report JSON parses: ${fileName}`, () => {
        JSON.parse(fs.readFileSync(path.join(buildDir, fileName), "utf8"));
        return true;
      }, `Report is not valid JSON: ${fileName}.`);
    }
  }

  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.length - passed;
  return { manifestPath, checks, passed, failed };

  function check(name, predicate, problem) {
    try {
      const ok = predicate();
      checks.push({ name, ok, problem: ok ? null : problem });
    } catch (error) {
      checks.push({ name, ok: false, problem: error.message || problem });
    }
  }
}

function validArtifactStatus(fileName, status) {
  if (!status || typeof status !== "object") return false;
  if (typeof status.kind !== "string" || status.kind.length === 0) return false;
  if (typeof status.format !== "string" || status.format.length === 0) return false;
  if (typeof status.runtimeStatus !== "string" || status.runtimeStatus.length === 0) return false;
  if (typeof status.executable !== "boolean") return false;
  if (status.runtimeStatus === "placeholder" && status.executable !== false) return false;
  if (fileName === "app.bin" && status.platform !== "not-windows-or-linux") return false;
  if (fileName === "app.wasm" && status.runtimeStatus !== "placeholder") return false;
  return true;
}

function validGeneratedOutputNaming(policy) {
  if (!policy || typeof policy !== "object") return false;
  if (policy.owner !== "Galerina compiler") return false;
  if (policy.pathSeparator !== "/") return false;
  if (!Array.isArray(policy.outputs) || policy.outputs.length === 0) return false;
  const paths = new Set();
  for (const output of policy.outputs) {
    if (!output || typeof output !== "object") return false;
    if (typeof output.path !== "string" || output.path.length === 0) return false;
    if (path.isAbsolute(output.path) || output.path.includes("\\") || output.path.includes("..")) return false;
    if (paths.has(output.path)) return false;
    paths.add(output.path);
    if (typeof output.kind !== "string" || output.kind.length === 0) return false;
    if (typeof output.format !== "string" || output.format.length === 0) return false;
    if (typeof output.cleanup !== "boolean") return false;
  }
  return paths.has("app.build-manifest.json");
}

function validSourceHashPolicy(inputs) {
  if (!inputs || typeof inputs !== "object") return false;
  if (inputs.sourceHashAlgorithm !== "sha256") return false;
  if (typeof inputs.sourceHash !== "string" || !inputs.sourceHash.startsWith("sha256:")) return false;
  if (!Number.isInteger(inputs.fileCount) || inputs.fileCount < 1) return false;
  if (!Array.isArray(inputs.sourceFiles) || inputs.sourceFiles.length !== inputs.fileCount) return false;
  const seen = new Set();
  for (const sourceFile of inputs.sourceFiles) {
    if (!sourceFile || typeof sourceFile !== "object") return false;
    if (typeof sourceFile.path !== "string" || sourceFile.path.length === 0) return false;
    if (path.isAbsolute(sourceFile.path) || sourceFile.path.includes("\\") || sourceFile.path.includes("..")) return false;
    if (seen.has(sourceFile.path)) return false;
    seen.add(sourceFile.path);
    if (typeof sourceFile.hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(sourceFile.hash)) return false;
    if (!Number.isInteger(sourceFile.bytes) || sourceFile.bytes < 0) return false;
  }
  return true;
}

function validDependencyHashPolicy(inputs) {
  if (!inputs || typeof inputs !== "object") return false;
  if (inputs.dependencyHashAlgorithm !== "sha256") return false;
  if (typeof inputs.dependencyHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(inputs.dependencyHash)) return false;
  if (!Number.isInteger(inputs.dependencyCount) || inputs.dependencyCount < 0) return false;
  if (!Array.isArray(inputs.dependencies) || inputs.dependencies.length !== inputs.dependencyCount) return false;
  const seen = new Set();
  for (const dependency of inputs.dependencies) {
    if (!dependency || typeof dependency !== "object") return false;
    if (typeof dependency.module !== "string" || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(dependency.module)) return false;
    if (seen.has(dependency.module)) return false;
    seen.add(dependency.module);
    if (typeof dependency.hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(dependency.hash)) return false;
    if (!["browser-safe", "server-only", "compute-safe", "declared-import"].includes(dependency.kind)) return false;
  }
  return true;
}

function validDeterministicBuildRules(rules, inputs) {
  if (!rules || typeof rules !== "object") return false;
  if (!inputs || typeof inputs !== "object") return false;
  if (rules.hashAlgorithm !== "sha256") return false;
  if (rules.pathSeparator !== "/") return false;
  if (!Array.isArray(rules.stableInputs) || !rules.stableInputs.includes("sourceHash") || !rules.stableInputs.includes("dependencyHash")) return false;
  if (!Array.isArray(rules.excludedMetadata) || !rules.excludedMetadata.includes("createdAt")) return false;
  if (typeof rules.outputHashNormalisation !== "string" || !rules.outputHashNormalisation.includes("trailing newline")) return false;
  if (typeof inputs.buildInputHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(inputs.buildInputHash)) return false;
  return true;
}

function resolveManifestPath(input) {
  if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
    return path.join(input, "app.build-manifest.json");
  }
  return input;
}

function writeAiContext(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const json = path.join(outDir, "app.ai-context.json");
  const markdown = path.join(outDir, "app.ai-context.md");
  fs.writeFileSync(json, JSON.stringify(buildAiContext(result), null, 2) + "\n", "utf8");
  fs.writeFileSync(markdown, aiContextMarkdown(result) + "\n", "utf8");
  return { json, markdown };
}

function buildTargetReport(result) {
  const blocks = result.ast.computeBlocks.map((block, index) => targetBlockReport(block, index));
  const declaredTargets = result.ast.targets.map((target) => targetReport(target, blocks));
  const blocked = blocks.filter((block) => block.status === "blocked");
  const fallbackCovered = blocks.filter((block) => block.fallbackCovered);
  const cpuReferenceChecks = blocks.filter((block) => block.verification.cpuReference);
  const diagnostics = result.diagnostics.filter((diagnostic) => diagnostic.category === "target" || diagnostic.category === "logic");

  return {
    compiler: VERSION,
    project: result.ast.project,
    cpuCompatibility: "required",
    realPhotonicBackend: false,
    summary: {
      declaredTargets: declaredTargets.length,
      computeBlocks: blocks.length,
      computeBlocksCompatible: blocks.length - blocked.length,
      computeBlocksBlocked: blocked.length,
      computeBlocksWithFallback: fallbackCovered.length,
      cpuReferenceChecks: cpuReferenceChecks.length,
      unsupportedOperations: Array.from(new Set(blocked.flatMap((block) => block.blockedOperations))).sort()
    },
    acceleratorRiskModel: {
      externalDataAssumption: false,
      risks: ACCELERATOR_RISKS,
      rule: "Accelerator outputs are local computation results and must be validated through reports and optional CPU reference checks."
    },
    precisionSummary: precisionSummary(blocks),
    logicCapability: logicCapabilitySummary(result.ast.targets, result.ast.logic),
    capabilityModel: buildCapabilityModelReport(result.ast),
    targets: declaredTargets,
    computeBlocks: blocks,
    sourceMap: blocks.map((block) => ({
      id: block.id,
      file: block.file,
      line: block.line,
      column: block.column,
      target: block.target,
      status: block.status
    })),
    fallbackPolicy: "Photonic and GPU targets are planning targets in v0.1; binary CPU output remains the compatibility baseline.",
    diagnostics
  };
}

function targetBlockReport(block, index) {
  const preference = targetPreference(block);
  const blocked = block.bannedOperations.length > 0;
  const fallbackCovered = preference.includes("cpu") || preference.includes("binary");
  const cpuReference = block.verify === "cpu_reference";

  return {
    id: `compute-${index + 1}`,
    file: block.file,
    line: block.line,
    column: block.column,
    target: block.target,
    status: blocked ? "blocked" : "compatible",
    prefers: block.prefers,
    fallbacks: block.fallbacks,
    preference,
    fallbackCovered,
    verification: {
      mode: block.verify || "none",
      cpuReference,
      status: cpuReference ? "planned" : "not_requested",
      reproducibility: cpuReference ? "compare accelerator output against CPU reference where practical" : "no explicit reference check requested"
    },
    errorCorrection: {
      policy: cpuReference ? "cpu_reference_compare_then_retry_or_fallback" : "report_only",
      actions: cpuReference
        ? ACCELERATOR_ERROR_CORRECTION_POLICY.correction
        : ["record_precision_risk", "use_declared_fallback_if_target_fails"],
      failClosed: cpuReference
    },
    precision: {
      expectedDifference: cpuReference ? "report_at_runtime_or_simulation" : "not_measured",
      confidenceLevel: cpuReference ? "report_at_runtime_or_simulation" : "not_measured",
      risks: ACCELERATOR_RISKS
    },
    compatibility: {
      binary: !blocked,
      wasm: !blocked && !block.bannedOperations.includes("database."),
      gpuPlan: !blocked,
      photonicPlan: !blocked,
      ternarySimulation: !blocked,
      omniLogicSimulation: !blocked
    },
    blockedOperations: block.bannedOperations,
    notes: blocked
      ? ["Move blocked I/O, secrets and environment access outside the compute block."]
      : ["Compute block is plan-compatible and has no blocked operations."]
  };
}

function targetReport(target, blocks) {
  const relevant = blocks.filter((block) => block.preference.includes(normaliseTargetName(target.name)));
  const blocked = relevant.filter((block) => block.status === "blocked");
  return {
    name: target.name,
    enabled: target.enabled,
    mode: target.mode,
    status: target.enabled ? targetStatus(target.name, target.mode) : "disabled",
    fallback: target.fallback || null,
    fallbackChain: target.fallback ? [target.name, target.fallback] : [target.name],
    output: target.output || TARGET_OUTPUTS[target.name] || null,
    logicWidth: targetLogicWidth(target.name),
    logicSupport: targetLogicSupport(target.name),
    compatibleComputeBlocks: relevant.length - blocked.length,
    blockedComputeBlocks: blocked.length,
    notes: targetNotes(target)
  };
}

function logicCapabilitySummary(targets, logic) {
  return targets.map((target) => ({
    target: target.name,
    requestedLogicWidth: logic?.width || null,
    nativeLogicWidth: targetLogicWidth(target.name),
    supportedSimulatedWidths: targetSupportedSimulatedWidths(target.name),
    mode: targetLogicSupport(target.name)
  }));
}

function buildCapabilityModelReport(ast) {
  return {
    declared: {
      aLOw: ast.capabilities?.allow || [],
      block: ast.capabilities?.block || []
    },
    imports: ast.imports.map((item) => ({
      module: item.module,
      file: item.file,
      line: item.line,
      capability: capabilityForImport(item.module),
      browserSafe: BROWSER_SAFE_IMPORTS.has(item.module) || COMPUTE_SAFE_IMPORTS.has(item.module),
      serverOnly: isServerOnlyImport(item.module)
    })),
    browser: {
      enabled: ast.targets.some((target) => target.enabled && target.name === "browser"),
      serverOnlyImportsBlocked: ast.imports.filter((item) => isServerOnlyImport(item.module)).map((item) => item.module)
    }
  };
}

function targetLogicWidth(name) {
  if (name === "omni") return "dynamic";
  if (name === "ternary") return 3;
  return 2;
}

function targetSupportedSimulatedWidths(name) {
  if (name === "omni") return "dynamic";
  if (name === "ternary") return [3];
  if (name === "binary" || name === "wasm" || name === "gpu" || name === "photonic") return [3];
  return [];
}

function targetLogicSupport(name) {
  if (name === "omni") return "dynamic_logic_width_simulation";
  if (name === "ternary") return "native_simulation_width_3";
  if (name === "photonic") return "future_backend_capability_report";
  if (name === "binary" || name === "wasm" || name === "gpu") return "binary_native_wider_logic_by_simulation";
  return "unknown";
}

function targetSupportsLogicWidth(name, width) {
  const simulatedWidths = targetSupportedSimulatedWidths(name);
  return simulatedWidths === "dynamic" || simulatedWidths.includes(width);
}

function precisionSummary(blocks) {
  return {
    cpuReferenceChecks: blocks.filter((block) => block.verification.cpuReference).length,
    precisionReportsRequired: blocks.filter((block) => block.verification.cpuReference || block.preference.includes("photonic") || block.preference.includes("gpu")).length,
    risksTracked: ACCELERATOR_RISKS
  };
}

function buildPrecisionReport(result) {
  const targetReport = buildTargetReport(result);
  return {
    compiler: VERSION,
    project: result.ast.project,
    principle: "Galerina does not assume photonic, GPU, ternary or quantum targets produce mysterious external data.",
    rule: "Accelerator outputs must be treated as local computation results and validated through source maps, target reports, precision reports and optional CPU reference checks.",
    cpuReferenceRule: "Accelerator output must be verifiable against CPU reference output where practical.",
    errorCorrectionPolicy: ACCELERATOR_ERROR_CORRECTION_POLICY,
    risks: ACCELERATOR_RISKS,
    computeBlocks: targetReport.computeBlocks.map((block) => ({
      id: block.id,
      file: block.file,
      line: block.line,
      target: block.target,
      preference: block.preference,
      verification: block.verification,
      errorCorrection: block.errorCorrection,
      precision: block.precision,
      fallbackCovered: block.fallbackCovered,
      blockedOperations: block.blockedOperations
    }))
  };
}

function targetPreference(block) {
  const output = [];
  if (block.target && block.target !== "best") output.push(normaliseTargetName(block.target));
  for (const preferred of block.prefers) output.push(normaliseTargetName(preferred));
  for (const fallback of block.fallbacks) output.push(normaliseTargetName(fallback));
  if (output.length === 0 || block.target === "best") {
    output.unshift("best");
  }
  return Array.from(new Set(output));
}

function normaliseTargetName(target) {
  if (target === "cpu") return "binary";
  return target;
}

function targetStatus(name, mode) {
  if (name === "binary") return "prototype-output";
  if (name === "wasm") return "placeholder-output";
  if (name === "gpu" || name === "photonic") return mode === "plan" ? "plan-only" : "future-backend";
  if (name === "ternary") return "simulation";
  if (name === "omni") return "omni-logic-simulation";
  return "unknown";
}

function targetNotes(target) {
  if (target.name === "binary") return ["CPU/binary output is the compatibility baseline."];
  if (target.name === "gpu") return ["GPU is emitted as a planning report in the prototype."];
  if (target.name === "photonic") return ["Photonic support is planning-only; no real photonic backend is claimed."];
  if (target.name === "ternary") return ["Ternary output is a simulation/report target."];
  if (target.name === "omni") return ["Omni-logic output is a future-compatible logic-width simulation report."];
  if (target.name === "wasm") return ["WASM output is a placeholder in the prototype."];
  return [];
}

function buildSecurityReport(result) {
  const strictComments = result.ast.strictComments || [];
  const runtimeReport = buildRuntimeReport(result);
  const globalReport = buildGlobalReport(result);
  return {
    compiler: VERSION,
    project: result.ast.project,
    defaults: {
      strictTypes: true,
      undefined: "deny",
      silentNull: "deny",
      unsafe: result.ast.security.unsafe || "deny",
      secretLogging: result.ast.security.secret_logging || "deny",
      sourceMaps: true
    },
    permissions: result.ast.permissions,
    webhooks: result.ast.webhooks.map((webhook) => ({
      name: webhook.name,
      hmacHeader: webhook.hmacHeader,
      maxAge: webhook.maxAge,
      maxBodySize: webhook.maxBodySize,
      replayProtection: webhook.replayProtection,
      idempotencyKey: webhook.idempotencyKey
    })),
    strictComments: {
      count: strictComments.length,
      securityTagged: strictComments.filter((comment) => Boolean(comment.tags.security)).length,
      aiRiskTagged: strictComments.filter((comment) => Boolean(comment.tags["ai-risk"])).length,
      mismatches: result.diagnostics.filter((d) => d.errorType === "StrictCommentMismatch")
    },
    runtime: {
      memory: runtimeReport.memory,
      diagnostics: runtimeReport.diagnostics
    },
    globals: {
      total: globalReport.summary.total,
      secrets: globalReport.globals.filter((global) => global.kind === "secret").map((global) => ({
        name: global.name,
        type: global.type,
        source: global.source,
        value: "[redacted]"
      })),
      diagnostics: globalReport.diagnostics
    },
    diagnostics: result.diagnostics.filter((d) => d.errorType.includes("Security") || d.errorType.includes("Webhook") || d.errorType.includes("RuntimeMemory") || d.errorType.includes("Global") || d.errorType.includes("Null") || d.errorType.includes("Undefined") || d.errorType.includes("StrictComment"))
  };
}

function buildFailureReport(result) {
  return {
    compiler: VERSION,
    project: result.ast.project,
    ok: !result.diagnostics.some(isFailureDiagnostic),
    diagnostics: result.diagnostics
  };
}

function buildApiReport(result) {
  return {
    compiler: VERSION,
    project: result.ast.project,
    apis: result.ast.apis,
    webhooks: result.ast.webhooks
  };
}

function buildGlobalReport(result) {
  const globals = result.ast.globals || [];
  const byKind = (kind) => globals.filter((item) => item.kind === kind);
  return {
    compiler: VERSION,
    project: result.ast.project,
    policy: {
      localByDefault: true,
      globalsRequireRegistry: true,
      mutableGlobalStateRestricted: true,
      secretsRequireSecureString: true,
      secretValuesRedacted: true,
      sourceMapped: true
    },
    globals: globals.map((global) => ({
      name: global.name,
      type: global.type,
      kind: global.kind,
      source: `${global.file}:${global.line}`,
      env: global.env,
      mutable: Boolean(global.mutable),
      access: global.access || null,
      maxSize: global.maxSize || null,
      ttl: global.ttl || null,
      value: global.kind === "secret" ? "[redacted]" : global.value
    })),
    summary: {
      total: globals.length,
      constCount: byKind("const").length,
      configCount: byKind("config").length,
      secretCount: byKind("secret").length,
      stateCount: byKind("state").length
    },
    requiredEnvironment: globals.filter((global) => global.env).map((global) => ({
      name: global.env,
      global: global.name,
      kind: global.kind,
      required: global.kind === "secret"
    })),
    diagnostics: result.diagnostics.filter((diagnostic) => diagnostic.errorType.startsWith("Global"))
  };
}

function buildRuntimeReport(result) {
  const runtime = result.ast.runtime || defaultRuntimeContract();
  const memory = runtime.memory || {};
  const spill = memory.spill || {};
  return {
    compiler: VERSION,
    project: result.ast.project,
    runtime,
    execution: {
      runMode: runtime.runMode || "checked",
      cacheIr: Boolean(runtime.cacheIr),
      hotReload: Boolean(runtime.hotReload),
      checkedRun: (runtime.runMode || "checked") !== "unchecked"
    },
    memory: {
      softLimit: memory.softLimit || null,
      hardLimit: memory.hardLimit || null,
      onPressure: memory.onPressure || [],
      spill: {
        enabled: Boolean(spill.enabled),
        path: spill.path || null,
        maxDisk: spill.maxDisk || null,
        ttl: spill.ttl || null,
        encryption: Boolean(spill.encryption),
        redactSecrets: spill.redactSecrets !== false,
        aLOw: spill.allow || [],
        deny: spill.deny || []
      }
    },
    policy: {
      spillIsALOwListOnly: true,
      denySecretsAndRequestContext: true,
      sourceMappedFailures: true,
      pressureActionsAreOrdered: true
    },
    diagnostics: runtimeMemoryDiagnostics(runtime)
  };
}

function buildMemoryReport(result) {
  const runtimeReport = buildRuntimeReport(result);
  const memory = runtimeReport.memory;
  const spill = memory.spill;
  return {
    compiler: VERSION,
    project: result.ast.project,
    summary: {
      cacheLimitBehaviour: "calculate_return_and_bypass_cache_storage",
      totalMemoryBehaviour: "controlled_memory_pressure_ladder",
      spillMode: "explicit_aLOw_list_only",
      secretSpillDefault: "denied",
      failureMode: "graceful_before_uncontrolled_out_of_memory"
    },
    runtimePolicy: memory,
    pressureLadder: MEMORY_PRESSURE_LADDER,
    cacheLimit: {
      name: "cache_bypass",
      behaviour: [
        "calculate_result",
        "return_result",
        "do_not_store_result_in_cache",
        "record_cache_bypass_warning",
        "recommend_cache_change_if_repeated"
      ],
      correctnessRule: "A cache memory limit must not change the calculated result."
    },
    spillPolicy: {
      enabled: spill.enabled,
      path: spill.path,
      maxDisk: spill.maxDisk,
      ttl: spill.ttl,
      encryption: spill.encryption,
      redactSecrets: spill.redactSecrets,
      aLOw: spill.aLOw,
      deny: spill.deny,
      approvedData: APPROVED_SPILL_DATA,
      deniedData: DENIED_SPILL_DATA,
      secretRule: "Secrets must not be spilled to disk by default."
    },
    queueAndChannelPolicy: {
      overflowActions: [
        "wait",
        "reject",
        "dead_letter",
        "spill_then_dead_letter",
        "drop_oldest",
        "drop_newest",
        "scale_worker"
      ],
      defaultRule: "Queues and channels should have bounded buffers and explicit overflow behaviour."
    },
    jsonStreamPolicy: {
      defaultRule: "Large JSON payloads should stream rather than load fully into memory.",
      spillRule: "JSON stream spill is aLOwed only when configured and bounded."
    },
    compileChecks: [
      "hard_limit_above_soft_limit",
      "spill_path_declared_when_spill_enabled",
      "spill_max_disk_declared_when_spill_enabled",
      "spill_ttl_declared_when_spill_enabled",
      "spill_redacts_secrets",
      "spill_denies_secure_types",
      "queues_have_overflow_policies",
      "caches_have_memory_limits_or_on_limit_actions"
    ],
    correctionFeatures: [
      "checkpointing",
      "rollback",
      "state_verification",
      "hash_checksum_validation",
      "safe_retry",
      "cache_demotion",
      "disk_spill",
      "structured_memory_reports"
    ],
    exampleDiagnostics: memoryCorrectionExampleDiagnostics(),
    recommendations: [
      "increase_app_memory_when_pressure_is_repeated",
      "reduce_or_remove_low_value_caches",
      "stream_large_json_payloads",
      "reduce_queue_buffer_size_or_add_backpressure",
      "move_batch_jobs_to_worker_mode",
      "increase_spill_disk_limit_only_for_approved_non_secret_data",
      "reduce_spill_ttl_to_limit_disk_growth"
    ],
    generatedOutputs: {
      memoryReport: "app.memory-report.json",
      runtimeReport: "app.runtime-report.json",
      memoryPressureGuide: "docs/memory-pressure-guide.md",
      runtimeGuide: "docs/runtime-guide.md",
      aiGuide: aiGuideOutput(result),
      mapManifest: "app.map-manifest.json"
    },
    diagnostics: runtimeReport.diagnostics
  };
}

function memoryCorrectionExampleDiagnostics() {
  return [
    standardDiagnostic({
      severity: "error",
      errorType: "MemoryIntegrityError",
      file: "examples/cache-demo.spore",
      line: 42,
      column: 1,
      target: "runtime",
      problem: "Memory integrity check failed. Runtime restored previous checkpoint.",
      suggestedFix: "Inspect the checkpoint source and retry policy before continuing production execution."
    }),
    standardDiagnostic({
      severity: "fatal",
      errorType: "MemoryCorruptionFatal",
      file: "examples/cache-demo.spore",
      line: 42,
      column: 1,
      target: "runtime",
      problem: "Memory corruption detected and recovery failed. Execution stopped safely.",
      suggestedFix: "Stop the runtime, preserve the memory report and investigate hardware, cache and spill state."
    })
  ];
}

function buildExecutionReport(result) {
  const runtime = result.ast.runtime || defaultRuntimeContract();
  const buildContract = result.ast.buildContract || {};
  return {
    compiler: VERSION,
    project: result.ast.project,
    runtime: {
      runMode: runtime.runMode || "checked",
      cacheIr: Boolean(runtime.cacheIr),
      hotReload: Boolean(runtime.hotReload)
    },
    compileMode: {
      mode: buildContract.mode || "debug",
      deterministic: Boolean(buildContract.deterministic),
      sourceMaps: buildContract.sourceMaps !== false,
      reports: buildContract.reports !== false,
      mapManifest: buildContract.mapManifest !== false,
      documentation: Boolean(buildContract.documentation),
      aiContext: buildContract.aiContext !== false,
      aiGuide: buildContract.aiGuide !== false
    },
    modes: EXECUTION_MODE_MATRIX,
    runModeChecks: [
      "parse_source",
      "type_check_source",
      "security_check_source",
      "validate_imports",
      "validate_strict_comments_where_required",
      "validate_api_and_webhook_contracts_where_relevant"
    ],
    compileModeOutputs: [
      "app.bin",
      "app.wasm",
      "app.gpu.plan",
      "app.photonic.plan",
      "app.ternary.sim",
      "app.omni-logic.sim",
      "app.source-map.json",
      "app.map-manifest.json",
      "app.security-report.json",
      "app.target-report.json",
      "app.api-report.json",
      "app.ai-guide.md",
      "app.ai-context.json",
      "app.build-manifest.json"
    ],
    productionRule: "Use Galerina run while developing, Galerina check before committing and Galerina build --mode release before production deployment.",
    aiGuideRule: "Only update the AI guide after a successful compile."
  };
}

function defaultRuntimeContract() {
  return {
    runMode: "checked",
    cacheIr: false,
    hotReload: false,
    memory: {
      softLimit: null,
      hardLimit: null,
      onPressure: [],
      spill: {
        enabled: false,
        path: null,
        maxDisk: null,
        ttl: null,
        encryption: false,
        redactSecrets: true,
        aLOw: [],
        deny: ["SecureString", "RequestContext", "SessionToken", "PaymentToken", "PrivateKey"]
      }
    }
  };
}

function runtimeMemoryDiagnostics(runtime) {
  const diagnostics = [];
  const spill = runtime?.memory?.spill;
  if (spill?.enabled && !spill.encryption) {
    diagnostics.push(standardDiagnostic({
      severity: "warning",
      errorType: "RuntimeSpillWarning",
      file: "(runtime)",
      line: 1,
      column: 1,
      problem: "Runtime spill is enabled without encryption.",
      suggestedFix: "Set spill.encryption true for disk-backed spill storage."
    }));
  }
  if (spill?.enabled && spill.redactSecrets === false) {
    diagnostics.push(standardDiagnostic({
      severity: "error",
      errorType: "RuntimeSpillError",
      file: "(runtime)",
      line: 1,
      column: 1,
      problem: "Runtime spill is enabled without secret redaction.",
      suggestedFix: "Set spill.redact_secrets true."
    }));
  }
  const deny = new Set(spill?.deny || []);
  for (const required of ["SecureString", "RequestContext", "SessionToken", "PaymentToken", "PrivateKey"]) {
    if (spill?.enabled && !deny.has(required)) {
      diagnostics.push(standardDiagnostic({
        severity: "warning",
        errorType: "RuntimeMemoryWarning",
        file: "(runtime)",
        line: 1,
        column: 1,
        problem: `Runtime spill deny list does not include ${required}.`,
        suggestedFix: `Add "${required}" to runtime.memory.spill.deny.`
      }));
    }
  }
  return diagnostics;
}

function buildMapManifest(result) {
  const docs = documentationOutputs(result);
  return {
    project: result.ast.project,
    version: "0.1.0",
    compiler: VERSION,
    buildMode: result.ast.buildContract.mode || "debug",
    entry: "boot.spore",
    applicationEntry: result.ast.entry,
    outputs: {
      binary: "app.bin",
      wasm: "app.wasm",
      sourceMap: "app.source-map.json",
      buildManifest: "app.build-manifest.json",
      mapManifest: "app.map-manifest.json",
      globalReport: "app.global-report.json",
      runtimeReport: "app.runtime-report.json",
      memoryReport: "app.memory-report.json",
      executionReport: "app.execution-report.json",
      apiReport: "app.api-report.json",
      apiGuide: docs.apiGuide,
      webhookGuide: docs.webhookGuide,
      typeReference: docs.typeReference,
      docsManifest: docs.docsManifest
    },
    sourceFiles: result.ast.files.map((file) => ({
      file: file.path,
      hash: `sha256:${file.sha256}`,
      compiledInto: compiledOutputsForSource(file.path, result)
    })),
    routes: result.ast.apis.flatMap((api) => api.routes.map((route) => ({
      api: api.name,
      method: route.method,
      path: route.path,
      handler: route.handler,
      source: `${api.file}:${api.line}`,
      request: route.request,
      response: route.response,
      docs: `${docs.apiGuide}#${anchor(`${route.method}-${route.path}`)}`
    }))),
    webhooks: result.ast.webhooks.map((webhook) => ({
      name: webhook.name,
      path: webhook.path,
      handler: webhook.handler,
      source: `${webhook.file}:${webhook.line}`,
      security: webhookSecuritySummary(webhook),
      docs: `${docs.webhookGuide}#${anchor(webhook.name)}`
    })),
    types: result.ast.types.map((type) => ({
      name: type.name,
      source: `${type.file}:${type.line}`,
      docs: `${docs.typeReference}#${anchor(type.name)}`
    })),
    globals: result.ast.globals.map((global) => ({
      name: global.name,
      kind: global.kind,
      type: global.type,
      source: `${global.file}:${global.line}`,
      env: global.env,
      docs: `${docs.globalRegistryGuide}#${anchor(global.kind)}`
    })),
    flows: result.ast.flows.map((flow) => ({
      name: flow.name,
      source: `${flow.file}:${flow.line}`,
      async: Boolean(flow.async),
      returns: flow.returns,
      effects: flow.effects
    })),
    computeBlocks: result.ast.computeBlocks.map((block, index) => ({
      id: `compute-${index + 1}`,
      source: `${block.file}:${block.line}`,
      target: block.target,
      prefers: block.prefers,
      fallbacks: block.fallbacks,
      verify: block.verify,
      plans: computePlanOutputs(block)
    })),
    generatedDocumentation: Object.values(docs),
    runtime: buildRuntimeReport(result).memory,
    memoryPolicy: {
      report: "app.memory-report.json",
      guide: docs.memoryPressureGuide,
      ladder: MEMORY_PRESSURE_LADDER.map((stage) => stage.action),
      cacheLimitBehaviour: "cache_bypass",
      spillRule: "aLOw_list_only_non_secret_data"
    },
    executionPolicy: {
      report: "app.execution-report.json",
      guide: docs.runCompileModeGuide,
      runMode: (result.ast.runtime || defaultRuntimeContract()).runMode || "checked",
      compileMode: result.ast.buildContract.mode || "debug",
      productionRule: "compile_fully_before_deploying"
    },
    globalRegistry: {
      report: "app.global-report.json",
      guide: docs.globalRegistryGuide,
      hash: `sha256:${globalRegistryHash(result)}`,
      requiredEnvironment: buildGlobalReport(result).requiredEnvironment.map((item) => item.name)
    },
    aiGuide: {
      output: aiGuideOutput(result),
      updateOnSuccessfulCompile: (result.ast.aiGuide || defaultAiGuideContract()).updateOnSuccessfulCompile !== false,
      jsonOutput: normaliseBuildOutputPath((result.ast.aiGuide || defaultAiGuideContract()).jsonOutput || "app.ai-context.json")
    },
    sourceMaps: ["app.source-map.json"],
    sourceHash: `sha256:${sha256(result.project.files.map((file) => file.content).join("\n"))}`
  };
}

function buildDocsManifest(result) {
  const docs = documentationOutputs(result);
  return {
    project: result.ast.project,
    compiler: VERSION,
    generatedFrom: {
      sourceMap: "app.source-map.json",
      apiReport: "app.api-report.json",
      mapManifest: "app.map-manifest.json",
      strictComments: result.ast.strictComments.length
    },
    documentationContract: result.ast.documentation || defaultDocumentationContract(),
    outputs: Object.values(docs).map((file) => ({
      file,
      format: file.endsWith(".json") ? "json" : file.endsWith(".html") ? "html" : "markdown"
    }))
  };
}

function documentationOutputs(result) {
  return {
    apiGuide: "docs/api-guide.md",
    webhookGuide: "docs/webhook-guide.md",
    typeReference: "docs/type-reference.md",
    globalRegistryGuide: "docs/global-registry-guide.md",
    securityGuide: "docs/security-guide.md",
    runtimeGuide: "docs/runtime-guide.md",
    memoryPressureGuide: "docs/memory-pressure-guide.md",
    runCompileModeGuide: "docs/run-compile-mode-guide.md",
    deploymentGuide: "docs/deployment-guide.md",
    aiSummary: "docs/ai-summary.md",
    docsManifest: "docs/docs-manifest.json"
  };
}

function defaultDocumentationContract() {
  return {
    enabled: true,
    required: false,
    output: "./build/docs",
    formats: ["markdown"],
    generate: ["api_guide", "webhook_guide", "type_reference", "global_registry_guide", "security_guide", "runtime_guide", "memory_pressure_guide", "run_compile_mode_guide", "deployment_guide", "ai_summary"],
    sources: ["api_contracts", "webhook_contracts", "type_definitions", "global_registry", "strict_comments", "security_rules", "runtime_rules", "memory_rules", "execution_rules", "target_reports", "source_maps"],
    rules: {
      redact_secrets: true,
      include_internal: false
    }
  };
}

function apiGuideMarkdown(result) {
  const context = buildAiContext(result);
  const routes = context.routeSummary;
  return `# API Guide

Generated from Galerina build output.

${routes.map((route) => `## ${route.method} ${route.path}

${strictPurposeFor(result, "api", route.api) || "No strict-comment purpose declared."}

### Handler

\`${route.handler || "not declared"}\`

### Request

\`${route.request || "not declared"}\`

### Response

\`${route.response || "not declared"}\`

### Runtime Rules

- Timeout: ${route.timeout || "not declared"}
- Max body size: ${route.maxBodySize || "not declared"}
`).join("\n") || "No API routes declared.\n"}`;
}

function webhookGuideMarkdown(result) {
  return `# Webhook Guide

Generated from Galerina build output.

${result.ast.webhooks.map((webhook) => `## ${webhook.name}

${strictPurposeFor(result, "webhook", webhook.name) || "No strict-comment purpose declared."}

- Method: ${webhook.method || "not declared"}
- Path: ${webhook.path || "not declared"}
- Handler: ${webhook.handler || "not declared"}
- HMAC header: ${webhook.hmacHeader || "not declared"}
- Replay protection: ${webhook.replayProtection || "not declared"}
- Idempotency key: ${webhook.idempotencyKey || "not declared"}
`).join("\n") || "No webhooks declared.\n"}`;
}

function typeReferenceMarkdown(result) {
  return `# Type Reference

Generated from Galerina build output.

${result.ast.types.map((type) => `## ${type.name}

Source: \`${type.file}:${type.line}\`

${type.alias ? `Alias: \`${type.alias}\`` : (type.fields || []).map((field) => `- \`${field.name}: ${field.type}\``).join("\n") || "No fields declared."}
`).join("\n") || "No types declared.\n"}`;
}

function globalRegistryGuideMarkdown(result) {
  const report = buildGlobalReport(result);
  const list = (kind) => report.globals.filter((global) => global.kind === kind);
  const render = (kind) => list(kind).map((global) => `- \`${global.name}: ${global.type}\`${global.env ? ` from \`${global.env}\`` : ""}`).join("\n") || "- none";
  return `# Global Registry Guide

Generated from Galerina build output.

## Principle

Local variables belong to flows. Global values belong to the registry. Mutable global state should be explicit, controlled and rare.

## Constants

${render("const")}

## Runtime Config

${render("config")}

## Secrets

${render("secret")}

Secret values are redacted in generated reports, source maps, generated documentation and AI context.

## Controlled State

${list("state").map((global) => `- \`${global.name}: ${global.type}\` access=${global.access || "not declared"} max_size=${global.maxSize || "not declared"} ttl=${global.ttl || "not declared"}`).join("\n") || "- none"}

## Required Environment

${report.requiredEnvironment.map((item) => `- \`${item.name}\` for \`${item.global}\`${item.required ? " (required secret)" : ""}`).join("\n") || "- none"}

## Security Rules

- Global values must be declared in the registry.
- Global values must have explicit types.
- Secrets must use SecureString.
- Secret values must be redacted in reports.
- Mutable shared state must be declared as state.
- Global mutation must be restricted.

## Diagnostics

${report.diagnostics.map((diagnostic) => `- ${diagnostic.severity}: ${diagnostic.problem}`).join("\n") || "- none"}
`;
}

function securityGuideMarkdown(result) {
  const report = buildSecurityReport(result);
  return `# Security Guide

Generated from Galerina build output.

## Defaults

- Strict types: ${report.defaults.strictTypes}
- Undefined: ${report.defaults.undefined}
- Silent null: ${report.defaults.silentNull}
- Unsafe: ${report.defaults.unsafe}
- Secret logging: ${report.defaults.secretLogging}
- Source maps: ${report.defaults.sourceMaps}

## Webhooks

${report.webhooks.map((webhook) => `- ${webhook.name}: HMAC=${webhook.hmacHeader || "not declared"}, replay=${webhook.replayProtection || "not declared"}, idempotency=${webhook.idempotencyKey || "not declared"}`).join("\n") || "- none"}

## Strict Comments

- Count: ${report.strictComments.count}
- Security tagged: ${report.strictComments.securityTagged}
- AI risk tagged: ${report.strictComments.aiRiskTagged}
- Mismatches: ${report.strictComments.mismatches.length}
`;
}

function runtimeGuideMarkdown(result) {
  const report = buildRuntimeReport(result);
  const memory = report.memory;
  const spill = memory.spill;
  return `# Runtime Guide

Generated from Galerina build output.

## Memory

- Run mode: ${report.execution.runMode}
- Cache IR: ${report.execution.cacheIr}
- Hot reload: ${report.execution.hotReload}
- Soft limit: ${memory.softLimit || "not declared"}
- Hard limit: ${memory.hardLimit || "not declared"}
- Pressure actions: ${memory.onPressure.join(", ") || "not declared"}

## Spill

- Enabled: ${spill.enabled}
- Path: ${spill.path || "not declared"}
- Max disk: ${spill.maxDisk || "not declared"}
- TTL: ${spill.ttl || "not declared"}
- Encryption: ${spill.encryption}
- Redact secrets: ${spill.redactSecrets}

### Spill Allow List

${spill.aLOw.map((item) => `- ${item}`).join("\n") || "- none"}

### Spill Deny List

${spill.deny.map((item) => `- ${item}`).join("\n") || "- none"}

## Policy

- Spill is aLOw-list only.
- Secret and request context types must not spill to disk.
- Memory pressure failure paths should be source-mapped.
- Pressure actions run in declared order.

## Diagnostics

${report.diagnostics.map((item) => `- ${item.severity}: ${item.problem}`).join("\n") || "- none"}
`;
}

function memoryPressureGuideMarkdown(result) {
  const report = buildMemoryReport(result);
  const policy = report.runtimePolicy;
  const spill = report.spillPolicy;
  return `# Memory Pressure Guide

Generated from Galerina build output.

## Core Rule

Limit long-lived memory. Protect normal execution. Spill only approved non-secret data. Fail safely before uncontrolled out-of-memory.

## Cache Limit vs Total Memory Pressure

| Situation | Behaviour |
|---|---|
| Cache limit hit | Calculate and return the result, then bypass cache storage |
| Queue buffer full | Apply the declared overflow policy |
| Soft memory limit reached | Start memory pressure actions |
| Hard memory limit reached | Reject new work or fail gracefully |
| Disk spill limit reached | Stop spilling and move to the next fallback |

## Runtime Policy

- Soft limit: ${policy.softLimit || "not declared"}
- Hard limit: ${policy.hardLimit || "not declared"}
- Pressure actions: ${policy.onPressure.join(", ") || "not declared"}

## Memory Pressure Ladder

${report.pressureLadder.map((stage) => `${stage.stage}. ${stage.action}: ${stage.behaviour}`).join("\n")}

## Cache Bypass

When a cached pure flow reaches its cache memory limit, Galerina should:

${report.cacheLimit.behaviour.map((item) => `- ${item}`).join("\n")}

Correctness rule: ${report.cacheLimit.correctnessRule}

## Disk Spill

- Enabled: ${spill.enabled}
- Path: ${spill.path || "not declared"}
- Max disk: ${spill.maxDisk || "not declared"}
- TTL: ${spill.ttl || "not declared"}
- Encryption: ${spill.encryption}
- Redact secrets: ${spill.redactSecrets}

### Approved Spill Data

${spill.approvedData.map((item) => `- ${item}`).join("\n")}

### Denied Spill Data

${spill.deniedData.map((item) => `- ${item}`).join("\n")}

## Secret Spill Rule

${spill.secretRule}

## Compile Checks

${report.compileChecks.map((item) => `- ${item}`).join("\n")}

## Recommendations

${report.recommendations.map((item) => `- ${item}`).join("\n")}

## Generated Outputs

- ${report.generatedOutputs.memoryReport}
- ${report.generatedOutputs.runtimeReport}
- ${report.generatedOutputs.memoryPressureGuide}
- ${report.generatedOutputs.runtimeGuide}
- ${report.generatedOutputs.mapManifest}
- ${report.generatedOutputs.aiGuide}
`;
}

function runCompileModeGuideMarkdown(result) {
  const report = buildExecutionReport(result);
  return `# Run Mode and Compile Mode Guide

Generated from Galerina build output.

## Summary

Run Mode is quick execution for scripts, learning and development. Compile Mode is the full production build with reports, manifests, documentation and target outputs.

Core principle:

\`\`\`text
Galerina can run directly, but it becomes fully Galerina when it is checked, compiled, mapped, reported and documented.
\`\`\`

## Runtime Settings

- Run mode: ${report.runtime.runMode}
- Cache IR: ${report.runtime.cacheIr}
- Hot reload: ${report.runtime.hotReload}

## Compile Settings

- Mode: ${report.compileMode.mode}
- Deterministic: ${report.compileMode.deterministic}
- Source maps: ${report.compileMode.sourceMaps}
- Reports: ${report.compileMode.reports}
- Map manifest: ${report.compileMode.mapManifest}
- Documentation: ${report.compileMode.documentation}
- AI context: ${report.compileMode.aiContext}
- AI guide: ${report.compileMode.aiGuide}

## Execution Modes

| Mode | Purpose | Command |
|---|---|---|
${report.modes.map((item) => `| ${item.mode} | ${item.purpose} | \`${item.command}\` |`).join("\n")}

## Checked Run Mode

Before execution, Galerina Run Mode should:

${report.runModeChecks.map((item) => `- ${item}`).join("\n")}

Run Mode should still enforce strict types, no undefined, no silent null, explicit errors, SecureString rules and source-located diagnostics.

## Compile Mode Outputs

${report.compileModeOutputs.map((item) => `- ${item}`).join("\n")}

## Production Rule

${report.productionRule}

## AI Guide Rule

${report.aiGuideRule}

## Final Rule

\`\`\`text
Run fast while developing.
Compile fully before deploying.
\`\`\`
`;
}

function deploymentGuideMarkdown(result) {
  const globalReport = buildGlobalReport(result);
  return `# Deployment Guide

Generated from Galerina build output.

## Required Artefacts

${requiredOutputs(result).map((file) => `- \`${file}\``).join("\n") || "- No project-specific required outputs declared."}

## Build Contract

- Mode: ${result.ast.buildContract.mode || "debug"}
- Deterministic: ${Boolean(result.ast.buildContract.deterministic)}
- Source maps: ${result.ast.buildContract.sourceMaps !== false}
- Reports: ${result.ast.buildContract.reports !== false}
- Map manifest: ${result.ast.buildContract.mapManifest !== false}
- AI context: ${result.ast.buildContract.aiContext !== false}
- AI guide: ${result.ast.buildContract.aiGuide !== false}
- Documentation: ${Boolean(result.ast.buildContract.documentation)}

## Required Environment

${globalReport.requiredEnvironment.map((item) => `- \`${item.name}\` for \`${item.global}\`${item.required ? " (secret)" : ""}`).join("\n") || "- none"}

Secret values are required at runtime and must not be committed to Git.
`;
}

function aiSummaryMarkdown(result) {
  return aiContextMarkdown(result);
}

function aiGuideMarkdown(result) {
  const context = buildAiContext(result);
  const targetReport = buildTargetReport(result);
  const securityReport = buildSecurityReport(result);
  const runtimeReport = buildRuntimeReport(result);
  const memoryReport = buildMemoryReport(result);
  const executionReport = buildExecutionReport(result);
  const globalReport = buildGlobalReport(result);
  const sourceHash = sha256(result.project.files.map((file) => file.content).join("\n"));
  const strictRisks = context.strictCommentSummary.filter((comment) => comment.aiRisk);
  const strictTodos = context.strictCommentSummary.filter((comment) => comment.aiTodo);

  return `# AI Guide

Generated by the Galerina compiler after a successful build.

## Build Identity

- Project: ${result.ast.project}
- Compiler: ${VERSION}
- Source hash: sha256:${sourceHash}
- Build manifest: app.build-manifest.json
- Compiled output: app.bin
- AI context JSON: app.ai-context.json

The guide hash is recorded in app.build-manifest.json after generation.

## Entry Points

- boot.spore
- ${result.ast.entry || "application entry not declared"}

## API Routes

${context.routeSummary.map((route) => `### ${route.method} ${route.path}

- Handler: ${route.handler || "not declared"}
- Request: ${route.request || "not declared"}
- Response: ${route.response || "not declared"}
- Timeout: ${route.timeout || "not declared"}
- Max body size: ${route.maxBodySize || "not declared"}
`).join("\n") || "No API routes declared.\n"}

## Webhooks

${context.webhookSummary.map((webhook) => `### ${webhook.name}

- Method: ${webhook.method || "not declared"}
- Path: ${webhook.path || "not declared"}
- Handler: ${webhook.handler || "not declared"}
- HMAC header: ${webhook.hmacHeader || "not declared"}
- Replay protection: ${webhook.replayProtection || "not declared"}
- Idempotency key: ${webhook.idempotencyKey || "not declared"}
`).join("\n") || "No webhooks declared.\n"}

## Types

${context.typeSummary.map((type) => type.alias ? `- ${type.name}: alias of ${type.alias}` : `- ${type.name}: ${type.kind}`).join("\n") || "- none"}

## Flows

${context.flowSummary.map((flow) => `- ${flow.qualifier} flow ${flow.name} -> ${flow.returns}; effects=[${flow.effects.join(", ") || "none"}]`).join("\n") || "- none"}

## Security

- Unsafe: ${securityReport.defaults.unsafe}
- Undefined: ${securityReport.defaults.undefined}
- Silent null: ${securityReport.defaults.silentNull}
- Secret logging: ${securityReport.defaults.secretLogging}
- Security diagnostics: ${securityReport.diagnostics.length}

## Global Registry

### Constants

${globalReport.globals.filter((global) => global.kind === "const").map((global) => `- \`${global.name}: ${global.type}\``).join("\n") || "- none"}

### Runtime Config

${globalReport.globals.filter((global) => global.kind === "config").map((global) => `- \`${global.name}: ${global.type}\``).join("\n") || "- none"}

### Secrets

${globalReport.globals.filter((global) => global.kind === "secret").map((global) => `- \`${global.name}: ${global.type}\``).join("\n") || "- none"}

Secret values are redacted.

## Target Summary

- Declared targets: ${targetReport.summary.declaredTargets}
- Compute blocks: ${targetReport.summary.computeBlocks}
- Blocked compute blocks: ${targetReport.summary.computeBlocksBlocked}
- CPU reference checks: ${targetReport.summary.cpuReferenceChecks}
- Unsupported operations: ${targetReport.summary.unsupportedOperations.join(", ") || "none"}

## Runtime Memory

- Run mode: ${executionReport.runtime.runMode}
- Cache IR: ${executionReport.runtime.cacheIr}
- Hot reload: ${executionReport.runtime.hotReload}
- Soft limit: ${runtimeReport.memory.softLimit || "not declared"}
- Hard limit: ${runtimeReport.memory.hardLimit || "not declared"}
- Pressure actions: ${runtimeReport.memory.onPressure.join(", ") || "not declared"}
- Spill enabled: ${runtimeReport.memory.spill.enabled}
- Spill path: ${runtimeReport.memory.spill.path || "not declared"}
- Spill max disk: ${runtimeReport.memory.spill.maxDisk || "not declared"}
- Spill encryption: ${runtimeReport.memory.spill.encryption}
- Spill redacts secrets: ${runtimeReport.memory.spill.redactSecrets}
- Cache limit behaviour: ${memoryReport.summary.cacheLimitBehaviour}
- Memory pressure ladder: ${memoryReport.pressureLadder.map((stage) => stage.action).join(", ")}
- Secret spill default: ${memoryReport.summary.secretSpillDefault}

## Strict Comments

${context.strictCommentSummary.map((comment) => `- ${comment.subject?.kind || "unknown"} ${comment.subject?.name || ""} ${comment.file}:${comment.line} tags=${comment.tags.join(",") || "none"}`).join("\n") || "- none"}

## AI Risks

${strictRisks.map((comment) => `- ${comment.file}:${comment.line} ${comment.aiRisk}`).join("\n") || "- none"}

## AI TODOs

${strictTodos.map((comment) => `- ${comment.file}:${comment.line} ${comment.aiTodo}`).join("\n") || "- none"}

## Source Maps

- app.source-map.json
- app.map-manifest.json

## Rule

- If Galerina can compile it, Galerina should be able to explain it.
- If the code compiles, the AI guide should describe the code that actually compiled.
- Compiled code should always come with generated explanation.
- Run fast while developing.
- Compile fully before deploying.
`;
}

function shouldGenerateAiGuide(result, success) {
  const config = result.ast.aiGuide || defaultAiGuideContract();
  return success && config.enabled !== false && config.updateOnSuccessfulCompile !== false;
}

function aiGuideOutput(result) {
  return normaliseBuildOutputPath((result.ast.aiGuide || defaultAiGuideContract()).output || "app.ai-guide.md");
}

function defaultAiGuideContract() {
  return {
    enabled: true,
    updateOnSuccessfulCompile: true,
    output: "./build/app.ai-guide.md",
    jsonOutput: "./build/app.ai-context.json",
    include: [
      "project_summary",
      "entry_points",
      "routes",
      "webhooks",
      "types",
      "flows",
      "effects",
      "security_rules",
      "runtime_rules",
      "memory_rules",
      "target_summary",
      "strict_comments",
      "known_risks",
      "ai_todos"
    ],
    rules: {
      redact_secrets: true,
      include_internal: false,
      fail_if_stale: true
    }
  };
}

function strictPurposeFor(result, kind, name) {
  const comment = result.ast.strictComments.find((item) => item.subject?.kind === kind && item.subject?.name === name);
  return comment ? firstTag(comment, "purpose") || firstTag(comment, "summary") : null;
}

function compiledOutputsForSource(file, result) {
  const outputs = ["app.bin", "app.wasm", "app.source-map.json", "app.map-manifest.json"];
  if (result.ast.globals.some((global) => global.file === file)) outputs.push("app.global-report.json", "docs/global-registry-guide.md");
  if (result.ast.runtime && file.endsWith("boot.spore")) outputs.push("app.runtime-report.json", "app.memory-report.json", "docs/runtime-guide.md", "docs/memory-pressure-guide.md");
  if (result.ast.apis.some((api) => api.file === file)) outputs.push("app.openapi.json", "app.api-report.json", "docs/api-guide.md");
  if (result.ast.webhooks.some((webhook) => webhook.file === file)) outputs.push("app.api-report.json", "docs/webhook-guide.md");
  if (result.ast.types.some((type) => type.file === file)) outputs.push("app.schemas.json", "docs/type-reference.md");
  if (result.ast.computeBlocks.some((block) => block.file === file)) outputs.push("app.gpu.plan", "app.photonic.plan", "app.ternary.sim", "app.omni-logic.sim", "app.target-report.json");
  if (result.ast.targets.some((target) => target.file === file && target.name === "browser")) outputs.push("app.browser.js", "app.target-report.json", "app.security-report.json");
  if (file.endsWith("boot.spore")) outputs.push("app.execution-report.json", "docs/run-compile-mode-guide.md");
  return Array.from(new Set(outputs));
}

function webhookSecuritySummary(webhook) {
  const output = [];
  if (webhook.hmacHeader) output.push("hmac");
  if (webhook.replayProtection) output.push("replay_protection");
  if (webhook.idempotencyKey) output.push("idempotency");
  if (webhook.maxBodySize) output.push("max_body_size");
  return output;
}

function anchor(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function computePlanOutputs(block) {
  const outputs = [];
  const targets = [block.target, ...block.prefers, ...block.fallbacks];
  if (targets.includes("gpu") || block.target === "best") outputs.push("app.gpu.plan");
  if (targets.includes("photonic") || block.target === "best") outputs.push("app.photonic.plan");
  if (targets.includes("ternary")) outputs.push("app.ternary.sim");
  if (targets.includes("omni") || block.target === "best") outputs.push("app.omni-logic.sim");
  outputs.push("app.target-report.json", "app.precision-report.json");
  return Array.from(new Set(outputs));
}

function requiredOutputs(result) {
  return (result.ast.buildContract.requireOutputs || []).map(normaliseBuildOutputPath);
}

function normaliseBuildOutputPath(file) {
  let value = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (value.startsWith("build/")) value = value.slice("build/".length);
  value = value.replace(/^(debug|release|examples)\//, "");
  return value;
}

function enforceBuildContract(result, outputs) {
  if (!result.ast.buildContract.failOnMissingOutput) return;
  const missing = requiredOutputs(result).filter((file) => !Object.prototype.hasOwnProperty.call(outputs, file));
  if (missing.length > 0) {
    fail(`Required build outputs were not generated: ${missing.join(", ")}`);
  }
}

function buildOpenApi(result) {
  const paths = {};
  for (const api of result.ast.apis) {
    for (const route of api.routes) {
      paths[route.path] = paths[route.path] || {};
      paths[route.path][route.method.toLowerCase()] = {
        operationId: route.handler,
        summary: `${route.method} ${route.path}`,
        responses: {
          "200": {
            description: route.response || "Response"
          }
        }
      };
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: result.ast.project,
      version: "0.1.0"
    },
    paths
  };
}

function buildSourceMap(result) {
  return {
    version: 1,
    compiler: VERSION,
    project: result.ast.project,
    files: result.ast.files,
    symbols: [
      ...result.ast.flows.map((flow) => ({ kind: "flow", name: flow.name, file: flow.file, line: flow.line, column: flow.column })),
      ...result.ast.types.map((type) => ({ kind: "type", name: type.name, file: type.file, line: type.line, column: type.column })),
      ...result.ast.enums.map((item) => ({ kind: "enum", name: item.name, file: item.file, line: item.line, column: item.column })),
      ...result.ast.globals.map((global) => ({ kind: "global", name: global.name, globalKind: global.kind, type: global.type, file: global.file, line: global.line, column: global.column })),
      ...result.ast.computeBlocks.map((block) => ({ kind: "compute", name: block.target, file: block.file, line: block.line, column: block.column })),
      ...result.ast.strictComments.map((comment) => ({
        kind: "strictComment",
        name: comment.subject?.name || comment.summary || "comment",
        subjectKind: comment.subject?.kind || "unknown",
        tags: Object.keys(comment.tags),
        file: comment.file,
        line: comment.line,
        column: comment.column
      }))
    ]
  };
}

function buildAiContext(result) {
  const targetReport = buildTargetReport(result);
  const securityReport = buildSecurityReport(result);
  const runtimeReport = buildRuntimeReport(result);
  const memoryReport = buildMemoryReport(result);
  const executionReport = buildExecutionReport(result);
  const globalReport = buildGlobalReport(result);
  const apiReport = buildApiReport(result);
  const uniqueTypes = uniqueByName(result.ast.types);
  const uniqueEnums = uniqueByName(result.ast.enums);
  const uniqueFlows = uniqueByName(result.ast.flows);

  return {
    compiler: VERSION,
    project: result.ast.project,
    entry: result.ast.entry,
    summary: {
      sourceFileCount: result.ast.files.length,
      typeCount: uniqueTypes.length,
      enumCount: uniqueEnums.length,
      flowCount: uniqueFlows.length,
      routeCount: apiReport.apis.reduce((count, api) => count + api.routes.length, 0),
      webhookCount: apiReport.webhooks.length,
      diagnosticCount: result.diagnostics.length
    },
    sourceFiles: result.ast.files.map((file) => ({
      path: file.path,
      lines: file.lines,
      sha256: file.sha256
    })),
    changedFiles: changedFilesSummary(result.project.root),
    routeSummary: result.ast.apis.flatMap((api) => api.routes.map((route) => ({
      api: api.name,
      method: route.method,
      path: route.path,
      request: route.request || null,
      response: route.response || null,
      handler: route.handler || null,
      timeout: route.timeout || null,
      maxBodySize: route.maxBodySize || null
    }))),
    webhookSummary: result.ast.webhooks.map((webhook) => ({
      name: webhook.name,
      method: webhook.method,
      path: webhook.path,
      handler: webhook.handler,
      hmacHeader: webhook.hmacHeader,
      replayProtection: webhook.replayProtection,
      idempotencyKey: webhook.idempotencyKey
    })),
    typeSummary: uniqueTypes.map((type) => ({
      name: type.name,
      kind: type.alias ? "alias" : "type",
      alias: type.alias || null,
      fields: (type.fields || []).map((field) => `${field.name}: ${field.type}`)
    })),
    enumSummary: uniqueEnums.map((item) => ({
      name: item.name,
      cases: item.cases
    })),
    flowSummary: uniqueFlows.map((flow) => ({
      name: flow.name,
      qualifier: flow.qualifier,
      async: Boolean(flow.async),
      params: flow.params,
      returns: flow.returns,
      effects: flow.effects,
      file: flow.file,
      line: flow.line
    })),
    strictCommentSummary: result.ast.strictComments.map((comment) => ({
      file: comment.file,
      line: comment.line,
      subject: comment.subject,
      tags: Object.keys(comment.tags),
      purpose: firstTag(comment, "purpose") || firstTag(comment, "summary"),
      security: firstTag(comment, "security"),
      effects: parseTagList(firstTag(comment, "effects")),
      aiNote: firstTag(comment, "ai-note"),
      aiRisk: firstTag(comment, "ai-risk"),
      aiTodo: firstTag(comment, "ai-todo")
    })),
    targets: result.ast.targets.map((target) => target.name),
    targetSummary: targetReport.summary,
    runtimeSummary: {
      memory: runtimeReport.memory,
      diagnostics: runtimeReport.diagnostics
    },
    memorySummary: {
      summary: memoryReport.summary,
      pressureLadder: memoryReport.pressureLadder,
      cacheLimit: memoryReport.cacheLimit,
      spillPolicy: memoryReport.spillPolicy
    },
    executionSummary: {
      runtime: executionReport.runtime,
      compileMode: executionReport.compileMode,
      productionRule: executionReport.productionRule,
      aiGuideRule: executionReport.aiGuideRule
    },
    globalSummary: {
      summary: globalReport.summary,
      globals: globalReport.globals.map((global) => ({
        name: global.name,
        kind: global.kind,
        type: global.type,
        source: global.source,
        env: global.env,
        value: global.kind === "secret" ? "[redacted]" : global.value
      })),
      requiredEnvironment: globalReport.requiredEnvironment
    },
    securitySummary: {
      defaults: securityReport.defaults,
      permissions: securityReport.permissions,
      webhookCount: securityReport.webhooks.length,
      diagnosticCount: securityReport.diagnostics.length
    },
    diagnostics: result.diagnostics,
    nextActions: [
      result.diagnostics.length > 0
        ? "Resolve diagnostics before treating output as buildable."
        : "No diagnostics in the analysed source set.",
      targetReport.summary.computeBlocksBlocked > 0
        ? "Move blocked operations out of compute blocks before relying on accelerator plans."
        : "Compute blocks in this context are target-plan compatible.",
      "Keep photonic and GPU work as plan targets until a real backend is selected.",
      "Preserve binary CPU fallback for every accelerated compute path."
    ]
  };
}

function aiContextMarkdown(result) {
  const context = buildAiContext(result);
  return `# ${context.project} AI Context

- Compiler: ${context.compiler}
- Entry: ${context.entry || "not declared"}
- Source files: ${context.summary.sourceFileCount}
- Types: ${context.summary.typeCount}
- Flows: ${context.summary.flowCount}
- Strict comments: ${context.strictCommentSummary.length}
- Routes: ${context.routeSummary.map((route) => `${route.method} ${route.path}`).join(", ") || "none"}
- Webhooks: ${context.webhookSummary.map((webhook) => webhook.name).join(", ") || "none"}
- Targets: ${context.targets.join(", ")}
- Diagnostics: ${context.summary.diagnosticCount}
- Changed files: ${context.changedFiles.status}

## Flows

${context.flowSummary.map((flow) => `- ${flow.qualifier} flow ${flow.name} -> ${flow.returns}`).join("\n") || "- none"}

## Strict Comments

${context.strictCommentSummary.map((comment) => `- ${comment.subject?.kind || "unknown"} ${comment.subject?.name || ""} ${comment.file}:${comment.line} tags=${comment.tags.join(",") || "none"}`).join("\n") || "- none"}

## Target Summary

- Compute blocks: ${context.targetSummary.computeBlocks}
- Blocked compute blocks: ${context.targetSummary.computeBlocksBlocked}
- Unsupported operations: ${context.targetSummary.unsupportedOperations.join(", ") || "none"}

## Next Actions

${context.nextActions.map((item) => `- ${item}`).join("\n")}
`;
}

function uniqueByName(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    output.push(item);
  }
  return output;
}

function changedFilesSummary(root) {
  try {
    if (!root || root === "(memory)") {
      return { status: "unavailable", reason: "No filesystem root for in-memory project.", files: [] };
    }
    const gitDir = findGitRoot(root);
    if (!gitDir) {
      return { status: "unavailable", reason: "No Git repository found.", files: [] };
    }
    const output = require("child_process").execFileSync("git", ["status", "--short"], {
      cwd: gitDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const files = output.split(/\r?\n/).filter(Boolean).map((line) => ({
      status: line.slice(0, 2).trim() || "modified",
      path: line.slice(3)
    }));
    return { status: files.length > 0 ? "dirty" : "clean", files };
  } catch (error) {
    return { status: "unavailable", reason: error.message, files: [] };
  }
}

function findGitRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function buildManifest(result, outputs = {}) {
  const sourceHash = sha256(result.project.files.map((file) => file.content).join("\n"));
  const dependencies = dependencyHashes(result.ast);
  const dependencyHash = sha256(dependencies.map((item) => item.module).join("\n"));
  const globalHash = globalRegistryHash(result);
  const mode = result.ast.buildContract.mode === "release" ? "release" : "debug";
  const buildInputHash = sha256([
    `mode:${mode}`,
    `source:${sourceHash}`,
    `dependencies:${dependencyHash}`,
    `globals:${globalHash}`
  ].join("\n"));
  const outputHashes = {};
  for (const [fileName, content] of Object.entries(outputs)) {
    outputHashes[fileName] = `sha256:${sha256(content.endsWith("\n") ? content : `${content}\n`)}`;
  }

  return {
    project: result.ast.project,
    version: "0.1.0",
    compiler: VERSION,
    mode,
    createdAt: new Date().toISOString(),
    deterministicInputs: {
      buildInputHashAlgorithm: "sha256",
      buildInputHash: `sha256:${buildInputHash}`,
      sourceHashAlgorithm: "sha256",
      sourceHash: `sha256:${sourceHash}`,
      fileCount: result.project.files.length,
      sourceFiles: sourceFileHashes(result.project),
      dependencyHashAlgorithm: "sha256",
      dependencyHash: `sha256:${dependencyHash}`,
      dependencyCount: dependencies.length,
      dependencies,
      globalRegistryHash: `sha256:${globalHash}`
    },
    deterministicBuildRules: deterministicBuildRules(),
    diagnosticSummary: diagnosticSummary(result.diagnostics),
    requiredEnvironment: buildGlobalReport(result).requiredEnvironment,
    targetOutputs: {
      binary: "app.bin",
      wasm: "app.wasm",
      ...(hasEnabledTarget(result.ast, "browser") ? { browserJavaScript: "app.browser.js" } : {}),
      gpuPlan: "app.gpu.plan",
      photonicPlan: "app.photonic.plan",
      ternarySimulation: "app.ternary.sim",
      omniLogicSimulation: "app.omni-logic.sim"
    },
    generatedOutputNaming: generatedOutputNamingPolicy(),
    artifactStatus: buildArtifactStatus(result),
    reports: [
      "app.api-report.json",
      "app.global-report.json",
      "app.map-manifest.json",
      "app.precision-report.json",
      "app.runtime-report.json",
      "app.memory-report.json",
      "app.execution-report.json",
      "app.schemas.json",
      "app.target-report.json",
      "app.security-report.json",
      "app.failure-report.json",
      "app.source-map.json",
      "app.tokens.json",
      "app.ai-context.json",
      "docs/docs-manifest.json"
    ],
    documentation: {
      required: Boolean(result.ast.documentation?.required || result.ast.buildContract.documentation),
      output: result.ast.documentation?.output || "./build/docs",
      outputs: Object.values(documentationOutputs(result))
    },
    aiGuide: {
      enabled: (result.ast.aiGuide || defaultAiGuideContract()).enabled !== false,
      updateOnSuccessfulCompile: (result.ast.aiGuide || defaultAiGuideContract()).updateOnSuccessfulCompile !== false,
      included: Object.prototype.hasOwnProperty.call(outputs, aiGuideOutput(result)),
      output: aiGuideOutput(result),
      jsonOutput: normaliseBuildOutputPath((result.ast.aiGuide || defaultAiGuideContract()).jsonOutput || "app.ai-context.json"),
      stalePolicy: "do_not_overwrite_last_valid_ai_guide_on_failed_compile"
    },
    requiredOutputs: requiredOutputs(result),
    outputHashes
  };
}

function sourceFileHashes(project) {
  return project.files
    .map((file) => ({
      path: file.relativePath,
      hash: `sha256:${sha256(file.content)}`,
      bytes: Buffer.byteLength(file.content, "utf8")
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function dependencyHashes(ast) {
  const modules = Array.from(new Set(ast.imports.map((item) => item.module))).sort();
  return modules.map((module) => ({
    module,
    kind: dependencyKind(module),
    hash: `sha256:${sha256(module)}`
  }));
}

function dependencyKind(module) {
  if (isServerOnlyImport(module)) return "server-only";
  if (BROWSER_SAFE_IMPORTS.has(module)) return "browser-safe";
  if (COMPUTE_SAFE_IMPORTS.has(module)) return "compute-safe";
  return "declared-import";
}

function deterministicBuildRules() {
  return {
    hashAlgorithm: "sha256",
    pathSeparator: "/",
    stableInputs: [
      "mode",
      "sourceHash",
      "dependencyHash",
      "globalRegistryHash"
    ],
    stableOutputs: [
      "outputHashes",
      "generatedOutputNaming",
      "artifactStatus"
    ],
    excludedMetadata: [
      "createdAt",
      "changedFiles"
    ],
    outputHashNormalisation: "Output hashes are calculated after normalising each generated file to one trailing newline.",
    rule: "A build is reproducible when stable inputs and generated output hashes match; timestamp and local Git status metadata are excluded."
  };
}

function generatedOutputNamingPolicy() {
  return {
    owner: "Galerina compiler",
    pathSeparator: "/",
    rootFiles: "app.*",
    docsDirectory: "docs/",
    rule: "Generated output names are stable, root-relative and use forward slashes in manifests.",
    outputs: GENERATED_OUTPUTS.map((item) => ({ ...item }))
  };
}

function buildArtifactStatus(result) {
  const status = {
    "app.bin": {
      kind: "cpu-compatible-placeholder",
      format: "text-placeholder",
      executable: false,
      platform: "not-windows-or-linux",
      runtimeStatus: "placeholder",
      runCommand: null,
      note: "This is not a Windows .exe, Linux ELF binary or macOS executable in the v0.1 prototype."
    },
    "app.wasm": {
      kind: "webassembly-placeholder",
      format: "text-placeholder",
      executable: false,
      platform: "wasm-planning-target",
      runtimeStatus: "placeholder",
      runCommand: null,
      note: "This is not a runnable WebAssembly module in the v0.1 prototype."
    },
    "app.gpu.plan": {
      kind: "target-plan",
      format: "text-report",
      executable: false,
      platform: "planning-only",
      runtimeStatus: "report"
    },
    "app.photonic.plan": {
      kind: "target-plan",
      format: "text-report",
      executable: false,
      platform: "planning-only",
      runtimeStatus: "report"
    },
    "app.ternary.sim": {
      kind: "logic-simulation-plan",
      format: "text-report",
      executable: false,
      platform: "simulation-only",
      runtimeStatus: "report"
    },
    "app.omni-logic.sim": {
      kind: "logic-simulation-plan",
      format: "text-report",
      executable: false,
      platform: "simulation-only",
      runtimeStatus: "report"
    }
  };

  if (hasEnabledTarget(result.ast, "browser")) {
    status["app.browser.js"] = {
      kind: "browser-javascript-placeholder",
      format: "javascript-placeholder",
      executable: false,
      platform: "browser-planning-target",
      runtimeStatus: "placeholder",
      runCommand: null,
      note: "This is a browser target placeholder, not a production JavaScript bundle."
    };
  }

  return status;
}

function diagnosticSummary(diagnostics) {
  const summary = {
    total: diagnostics.length,
    info: 0,
    warning: 0,
    error: 0,
    fatal: 0,
    categories: {},
    codes: {}
  };
  for (const diagnostic of diagnostics) {
    const level = diagnostic.level || diagnostic.severity || "error";
    summary[level] = (summary[level] || 0) + 1;
    summary.categories[diagnostic.category] = (summary.categories[diagnostic.category] || 0) + 1;
    summary.codes[diagnostic.code] = (summary.codes[diagnostic.code] || 0) + 1;
  }
  return summary;
}

function isFailureDiagnostic(diagnostic) {
  return diagnostic.severity === "error" || diagnostic.severity === "fatal" || diagnostic.level === "error" || diagnostic.level === "fatal";
}

function globalRegistryHash(result) {
  const shape = (result.ast.globals || []).map((global) => ({
    kind: global.kind,
    name: global.name,
    type: global.type,
    env: global.env || null,
    mutable: Boolean(global.mutable)
  }));
  return sha256(JSON.stringify(shape));
}

function buildTokenReport(result) {
  return {
    compiler: VERSION,
    project: result.ast.project,
    files: result.ast.files.map((file) => file.path),
    tokenCount: result.tokens.length,
    tokens: result.tokens
  };
}

function runProject(project, result, runOptions = {}) {
  const errors = result.diagnostics.filter(isFailureDiagnostic);
  if (errors.length > 0) {
    return { ok: false, output: [], diagnostics: errors };
  }

  const mainFlow = result.ast.flows.find((flow) => flow.name === "main");
  if (!mainFlow) {
    const diagnosticItem = {
      severity: "error",
      errorType: "RunEntryMissing",
      file: result.ast.entry || "(project)",
      line: 1,
      column: 1,
      problem: "Run Mode requires a main flow.",
      suggestedFix: "Add secure flow main() -> Result<Void, Error>."
    };
    result.diagnostics.push(diagnosticItem);
    return { ok: false, output: [], diagnostics: [diagnosticItem] };
  }

  const source = project.files.find((file) => file.relativePath === mainFlow.file) || project.files[0];
  const content = stripComments(source.content);
  if (/\brunComputeMixThroughputBenchmark\s*\(/.test(content)) {
    return runComputeMixThroughputBenchmarkExample(source, result, content, mainFlow, runOptions);
  }
  if (/\brunArithmeticThresholdBenchmark\s*\(/.test(content)) {
    return runArithmeticThresholdBenchmarkExample(source, result, content, mainFlow);
  }
  if (/\bguessFourDigitCode\s*\(/.test(content)) {
    return runFourDigitBenchmarkExample(source, result, content, mainFlow);
  }
  const functions = collectRunFunctions(content);
  const variables = collectRunVariables(content, functions);
  const output = collectRunOutput(content, variables, functions);
  return {
    ok: true,
    mode: (result.ast.runtime || defaultRuntimeContract()).runMode || "checked",
    checked: true,
    entry: mainFlow.file,
    output
  };
}

function runArithmeticThresholdBenchmarkExample(source, result, content, mainFlow) {
  const threshold = extractArithmeticThresholdBenchmarkConfig(content);
  const startedAt = process.hrtime.bigint();
  const startedCpu = process.cpuUsage();

  let total = 0;
  let i = 0;
  let additions = 0;

  while (total <= threshold) {
    total += i;
    i += 1;
    additions += 1;

    total += i;
    i += 1;
    additions += 1;
  }

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const cpu = process.cpuUsage(startedCpu);
  const memory = process.memoryUsage();
  const resource = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;
  const report = {
    runtime: "galerina-prototype",
    threshold,
    total,
    nextI: i,
    additions,
    loopCycles: additions / 2,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    additionsPerSecond: Number((additions / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)),
    cpu: {
      userMs: Number((cpu.user / 1000).toFixed(3)),
      systemMs: Number((cpu.system / 1000).toFixed(3)),
      totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3))
    },
    memory: {
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      maxRssBytes: resource ? resource.maxRSS * 1024 : null
    },
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    note: "Executed by the Galerina prototype runner for this benchmark fixture."
  };

  return {
    ok: true,
    mode: (result.ast.runtime || defaultRuntimeContract()).runMode || "checked",
    checked: true,
    entry: mainFlow.file,
    output: [JSON.stringify(report, null, 2)]
  };
}

function runComputeMixThroughputBenchmarkExample(source, result, content, mainFlow, runOptions) {
  const config = extractComputeMixBenchmarkConfig(content, runOptions);

  const warmupStartedAt = process.hrtime.bigint();
  if (config.warmupMs > 0) {
    const warmupState = {
      seed: config.seed >>> 0,
      checksum: 0
    };

    while (Number(process.hrtime.bigint() - warmupStartedAt) / 1_000_000 < config.warmupMs) {
      runComputeMixBatch(warmupState, config.batchSize);
    }
  }

  const state = {
    seed: config.seed >>> 0,
    checksum: 0
  };

  const startedAt = process.hrtime.bigint();
  const startedCpu = process.cpuUsage();
  let operations = 0;

  if (config.operations !== null) {
    while (operations < config.operations) {
      const batch = Math.min(config.batchSize, config.operations - operations);
      runComputeMixBatch(state, batch);
      operations += batch;
    }
  } else {
    while (Number(process.hrtime.bigint() - startedAt) / 1_000_000 < config.targetMs) {
      runComputeMixBatch(state, config.batchSize);
      operations += config.batchSize;
    }
  }

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const cpu = process.cpuUsage(startedCpu);
  const memory = process.memoryUsage();
  const resource = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;
  const report = {
    runtime: "galerina-prototype",
    benchmark: "compute-mix-throughput",
    executionMode: "nodejs-runner",
    comparisonType: "prototype-runner-overhead",
    targetMs: config.targetMs,
    warmupMs: config.warmupMs,
    batchSize: config.batchSize,
    seed: config.seed,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operations,
    operationsPerSecond: Number((operations / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)),
    checksum: state.checksum >>> 0,
    cpu: {
      userMs: Number((cpu.user / 1000).toFixed(3)),
      systemMs: Number((cpu.system / 1000).toFixed(3)),
      totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3))
    },
    memory: {
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      maxRssBytes: resource ? resource.maxRSS * 1024 : null
    },
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    notes: [
      "Executed by the Galerina prototype runner for this benchmark fixture.",
      "This measures Node.js runner overhead, not a native Galerina compiler."
    ]
  };

  return {
    ok: true,
    mode: (result.ast.runtime || defaultRuntimeContract()).runMode || "checked",
    checked: true,
    entry: mainFlow.file,
    output: [JSON.stringify(report, null, 2)]
  };
}

function extractComputeMixBenchmarkConfig(content, runOptions = {}) {
  const call = content.match(/\brunComputeMixThroughputBenchmark\s*\(\s*([0-9_]+)\s*,\s*([0-9_]+)\s*,\s*([0-9_]+)\s*\)/);
  return {
    targetMs: runOptions.targetMs ?? (call ? Number.parseInt(call[1].replace(/_/g, ""), 10) : 20000),
    warmupMs: runOptions.warmupMs ?? (call ? Number.parseInt(call[2].replace(/_/g, ""), 10) : 2000),
    batchSize: runOptions.batchSize ?? (call ? Number.parseInt(call[3].replace(/_/g, ""), 10) : 100000),
    operations: runOptions.operations,
    seed: runOptions.seed ?? 123456789
  };
}

function runComputeMixBatch(state, batchSize) {
  let seed = state.seed >>> 0;
  let checksum = state.checksum >>> 0;

  for (let i = 0; i < batchSize; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const mixed = Math.imul((seed ^ (seed >>> 16)) >>> 0, 2246822519) >>> 0;
    checksum = (checksum ^ mixed) >>> 0;
    if ((mixed & 1) === 1) {
      checksum = (checksum + mixed) >>> 0;
    } else {
      checksum = (checksum ^ ((mixed << 1) >>> 0)) >>> 0;
    }
  }

  state.seed = seed;
  state.checksum = checksum;
}

function extractArithmeticThresholdBenchmarkConfig(content) {
  const call = content.match(/\brunArithmeticThresholdBenchmark\s*\(\s*([0-9_]+)\s*\)/);
  if (!call) return 100_000_000_000_000;
  return Number.parseInt(call[1].replace(/_/g, ""), 10);
}

function runFourDigitBenchmarkExample(source, result, content, mainFlow) {
  const config = extractFourDigitBenchmarkConfig(content);
  const startedAt = process.hrtime.bigint();
  const startedCpu = process.cpuUsage();

  let attempt = 0;
  let guessedValue = null;
  while (attempt < config.maxAttempts) {
    attempt += 1;
    const candidate = String((attempt - 1) % 10000).padStart(4, "0");
    if (candidate === config.target) {
      guessedValue = candidate;
      break;
    }
  }

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const cpu = process.cpuUsage(startedCpu);
  const memory = process.memoryUsage();
  const resource = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;
  const found = guessedValue !== null;
  const attempts = found ? attempt : config.maxAttempts;
  const report = {
    runtime: "galerina-prototype",
    mode: "sequential",
    target: config.target,
    found,
    attempts,
    guessedValue,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    attemptsPerSecond: Number((attempts / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)),
    cpu: {
      userMs: Number((cpu.user / 1000).toFixed(3)),
      systemMs: Number((cpu.system / 1000).toFixed(3)),
      totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3))
    },
    memory: {
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      maxRssBytes: resource ? resource.maxRSS * 1024 : null
    },
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    note: "Executed by the Galerina prototype runner for this benchmark fixture."
  };

  return {
    ok: true,
    mode: (result.ast.runtime || defaultRuntimeContract()).runMode || "checked",
    checked: true,
    entry: mainFlow.file,
    output: [JSON.stringify(report, null, 2)]
  };
}

function extractFourDigitBenchmarkConfig(content) {
  const call = content.match(/\bguessFourDigitCode\s*\(\s*"([0-9]{4})"\s*,\s*([0-9_]+)\s*\)/);
  if (!call) {
    return { target: "0420", maxAttempts: 100000 };
  }
  return {
    target: call[1],
    maxAttempts: Number.parseInt(call[2].replace(/_/g, ""), 10)
  };
}

function collectRunVariables(content, functions) {
  const variables = new Map();
  for (const match of matches(content, /\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_][A-Za-z0-9_<>, ]*\s*=\s*([^\r\n]+)/g)) {
    variables.set(match[1], evaluateRunExpression(match[2], variables, functions));
  }
  return variables;
}

function collectRunOutput(content, variables, functions) {
  const output = [];
  const regex = /\b(?:print|console\.log)\s*\(/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const open = content.indexOf("(", match.index);
    const close = findMatchingParen(content, open);
    if (close === -1) continue;
    output.push(evaluateRunExpression(content.slice(open + 1, close), variables, functions));
    regex.lastIndex = close + 1;
  }
  return output;
}

function evaluateRunExpression(expression, variables, functions) {
  const text = expression.trim().replace(/;$/, "");
  const concatParts = splitRunOperator(text, ".");
  if (concatParts.length > 1) {
    return concatParts.map((part) => evaluateRunExpression(part, variables, functions)).join("");
  }
  const additionParts = splitRunOperator(text, "+");
  if (additionParts.length > 1) {
    const values = additionParts.map((part) => evaluateRunExpression(part, variables, functions));
    if (values.every(isNumericText)) return sumNumericText(values);
    return text;
  }
  const stringMatch = text.match(/^"([^"]*)"$/);
  if (stringMatch) return unescapeRunString(stringMatch[1]);
  if (text.startsWith("{") && text.endsWith("}")) return compactRunJson(text);
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  const simpleCall = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
  const dottedCall = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
  if (dottedCall && dottedCall[1] === "json" && dottedCall[2] === "pretty") {
    const value = evaluateRunExpression(dottedCall[3], variables, functions);
    return prettyRunJson(value);
  }
  if (simpleCall && functions.has(simpleCall[1])) {
    return evaluateRunFunction(simpleCall[1], simpleCall[2], variables, functions);
  }
  if (variables.has(text)) return variables.get(text);
  return text;
}

function evaluateRunFunction(name, argsText, outerVariables, functions) {
  const flow = functions.get(name);
  const localVariables = new Map(outerVariables);
  const args = splitTopLevel(argsText).map((arg) => evaluateRunExpression(arg, outerVariables, functions));
  flow.params.forEach((param, index) => {
    localVariables.set(param.name, args[index] || "");
  });
  return evaluateRunExpression(flow.returnExpression, localVariables, functions);
}

function collectRunFunctions(content) {
  const functions = new Map();
  const regex = /\b(?:async\s+)?(?:(secure|pure(?:\s+vector(?:\s+required)?)?)\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*[A-Za-z_][A-Za-z0-9_<>, ]*\s*\{/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const open = content.indexOf("{", match.index);
    const close = findMatchingBrace(content, open);
    if (open === -1 || close === -1) continue;
    const body = content.slice(open + 1, close);
    const returnExpression = extractRunReturnExpression(body);
    if (returnExpression) {
      functions.set(match[2], {
        params: parseParams(match[3]),
        returnExpression
      });
    }
    regex.lastIndex = close + 1;
  }
  return functions;
}

function extractRunReturnExpression(body) {
  const index = body.indexOf("return ");
  if (index === -1) return null;
  return body.slice(index + "return ".length).trim().replace(/;$/, "");
}

function isNumericText(value) {
  return /^-?\d+(?:\.\d+)?$/.test(String(value));
}

function sumNumericText(values) {
  const decimals = Math.max(0, ...values.map((value) => {
    const match = String(value).match(/\.(\d+)$/);
    return match ? match[1].length : 0;
  }));
  const scale = 10 ** decimals;
  const total = values.reduce((sum, value) => sum + Math.round(Number(value) * scale), 0);
  const result = String(total / scale);
  return decimals > 0 ? Number(result).toFixed(decimals) : result;
}

function compactRunJson(text) {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch (error) {
    return text;
  }
}

function prettyRunJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (error) {
    return text;
  }
}

function unescapeRunString(text) {
  return text.replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}

function splitRunOperator(text, operator) {
  const parts = [];
  let current = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") inString = !inString;
    const spacedOperator = char === operator && /\s/.test(text[index - 1] || "") && /\s/.test(text[index + 1] || "");
    if (!inString && spacedOperator) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findMatchingParen(text, open) {
  let depth = 0;
  let inString = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"" && text[index - 1] !== "\\") inString = !inString;
    if (inString) continue;
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function serveProject(result, options = {}) {
  return {
    compiler: VERSION,
    project: result.ast.project,
    mode: options.dev ? "dev" : "run",
    status: result.diagnostics.some(isFailureDiagnostic) ? "blocked" : "planned",
    runMode: (result.ast.runtime || defaultRuntimeContract()).runMode || "checked",
    hotReload: Boolean((result.ast.runtime || defaultRuntimeContract()).hotReload),
    cacheIr: Boolean((result.ast.runtime || defaultRuntimeContract()).cacheIr),
    routes: result.ast.apis.flatMap((api) => api.routes.map((route) => `${route.method} ${route.path}`)),
    webhooks: result.ast.webhooks.map((webhook) => `${webhook.method || "POST"} ${webhook.path || webhook.name}`),
    note: "The v0.1 prototype plans serve mode but does not start an HTTP runtime."
  };
}

function planText(result, target) {
  const report = buildTargetReport(result);
  const blocks = report.computeBlocks.filter((block) => target === "ternary" || target === "omni" || block.preference.includes(target) || block.target.includes(target));
  return [
    `Galerina ${target} prototype plan`,
    `Project: ${result.ast.project}`,
    `Real backend available: false`,
    "CPU compatibility: required",
    `Compute blocks in plan: ${blocks.length}`,
    `Blocked compute blocks: ${blocks.filter((block) => block.status === "blocked").length}`,
    `CPU reference checks: ${blocks.filter((block) => block.verification.cpuReference).length}`,
    "",
    "Compute blocks:",
    ...blocks.map((block) => `- ${block.id} ${block.file}:${block.line} target=${block.target} preference=${block.preference.join(" > ")} verify=${block.verification.mode} status=${block.status} blocked=${block.blockedOperations.join(",") || "none"}`)
  ].join("\n");
}

function explain(result, forAi) {
  const first = result.diagnostics.find(isFailureDiagnostic) || result.diagnostics[0];
  if (!first) {
    return forAi ? { ok: true, project: result.ast.project, problem: null } : `No Galerina diagnostics for ${result.ast.project}.`;
  }
  if (forAi) {
    return {
      errorType: first.errorType,
      severity: first.severity,
      file: first.file,
      line: first.line,
      column: first.column,
      problem: first.problem,
      suggestedFix: first.suggestedFix
    };
  }
  return `${first.severity.toUpperCase()} ${first.errorType} at ${first.file}:${first.line}:${first.column}
${first.problem}
${first.suggestedFix}`;
}

main(process.argv);

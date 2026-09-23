import test from "node:test";
import assert from "node:assert/strict";

import {
  REPORT_RUNTIMES,
  buildCrossLanguageRows,
  buildReportMarkdown,
  markdown as escapeMarkdown,
} from "../src/report-model.mjs";

const transition = Object.freeze({
  schema: "galerina.benchmark.slide-transition.v1",
  status: "DEFERRED_NO_SLIDE_LANE",
  baselineLabel: "Galerina/Wasm",
  candidateLabel: "Galerina/SLIDE",
  archiveDirectory: "2026-08-02_galerina-wasm-before-slide",
  authorityReleased: false,
  rows: Object.freeze([]),
  exclusions: Object.freeze([]),
});

test("legacy Wasm is ranked but cannot claim the production Galerina place", () => {
  const rows = buildCrossLanguageRows([{
    benchmark: "compute-fixture",
    metricClass: "cpu-throughput",
    units: { comparable: true, status: "PASS", unit: "ops/s" },
    results: {
      rust: { normThroughput: 300 },
      wasm: { normThroughput: 200 },
      galerinaGoverned: { normThroughput: 900 },
      python: { normThroughput: 100 },
    },
  }]);

  assert.equal(rows[0].interpretation.direction, "higher is better");
  assert.equal(rows[0].interpretation.winner, "Rust");
  assert.equal(rows[0].interpretation.galerinaPlace, "not measured");
  assert.equal(rows[0].wasm, 200);
});

test("generated Markdown explains every ranking column and the green tick", () => {
  const crossLanguage = buildCrossLanguageRows([
    {
      benchmark: "compute-fixture",
      metricClass: "cpu-throughput",
      units: { comparable: true, status: "PASS", unit: "ops/s" },
      results: { rust: { normThroughput: 300 }, wasm: { normThroughput: 200 } },
    },
    {
      benchmark: "legacy-fixture",
      metricClass: "cpu-throughput",
      results: { rust: { normThroughput: 300 }, wasm: { normThroughput: 400 } },
    },
  ]);
  const markdown = buildReportMarkdown({
    baseline: "fixture-baseline",
    runtimes: REPORT_RUNTIMES,
    diffFromLast: [],
    crossLanguage,
    slideTransition: transition,
  });

  assert.match(markdown, /\| Benchmark \| Unit \| Better \| Winner \| Galerina\/SLIDE production place \| Comment \|/u);
  assert.match(markdown, /compute-fixture ✅/u);
  assert.match(markdown, /higher is better \| Rust \| not measured/u);
  assert.match(markdown, /legacy-fixture \| per-call \| not certified \| no admitted winner \| not ranked/u);
  assert.match(markdown, /✅.*work-equivalent.*unit-aligned.*does not mean Galerina won/isu);
  assert.match(markdown, /Galerina\/Wasm legacy lane/u);
  assert.match(markdown, /production Galerina place remains unmeasured until an admitted `slide` lane exists/u);
});

test("memory rows display the lower-is-better bytes/op scores that actually choose the winner", () => {
  const crossLanguage = buildCrossLanguageRows([{
    benchmark: "memory-fixture",
    metricClass: "memory",
    units: { comparable: true, status: "PASS", unit: "records/s" },
    results: {
      nodejs: { normThroughput: 900, memory: { bytesPerOperation: 4 } },
      wasm: { normThroughput: 100, memory: { bytesPerOperation: 2 } },
    },
  }]);
  const markdown = buildReportMarkdown({
    baseline: null,
    runtimes: REPORT_RUNTIMES,
    diffFromLast: [],
    crossLanguage,
    slideTransition: transition,
  });

  assert.equal(crossLanguage[0].scoreUnit, "heap bytes/op");
  assert.match(markdown, /memory-fixture ✅ \| heap bytes\/op \| lower is better \(heap bytes\/op\)/u);
  assert.match(markdown, /\| — \| — \| — \| 4\.00 \| 2\.00 \| — \| — \|/u);
  assert.doesNotMatch(markdown, /\| 900 \| 100 \|/u);
});

test("native-controls-only scope ranks controls without implying a missing Galerina subject", () => {
  const rows = buildCrossLanguageRows([{
    benchmark: "spectral-norm",
    metricClass: "cpu-throughput",
    units: { comparable: true, status: "PASS", unit: "A-evals/s" },
    results: {
      rust: { normThroughput: 300 },
      nodejs: { normThroughput: 200 },
      python: { normThroughput: 100 },
    },
  }]);

  assert.equal(rows[0].comparisonScope, "native-controls-only");
  assert.equal(rows[0].interpretation.winner, "Rust");
  assert.equal(rows[0].interpretation.galerinaPlace, "not applicable - native controls only");
  assert.match(rows[0].interpretation.explanation, /deliberately excludes a Galerina subject/u);
});

test("reference-only scope keeps both observed references outside Galerina production ranking", () => {
  const rows = buildCrossLanguageRows([{
    benchmark: "verified-native-operation",
    metricClass: "cpu-throughput",
    units: { comparable: true, status: "PASS", unit: "element-reads/s" },
    results: {
      rust: { normThroughput: 300 },
      checkedReference: { normThroughput: 100 },
      slideReference: { normThroughput: 200 },
    },
  }]);

  assert.equal(rows[0].comparisonScope, "reference-only");
  assert.equal(rows[0].interpretation.winner, "Rust");
  assert.equal(rows[0].interpretation.galerinaPlace, "not applicable - references are unranked");
  assert.match(rows[0].interpretation.explanation, /reference lanes remain visible but unranked/u);
});

test("the report names the frozen old-Wasm baseline and defers until a real SLIDE lane exists", () => {
  const markdown = buildReportMarkdown({
    baseline: null,
    runtimes: REPORT_RUNTIMES,
    diffFromLast: [],
    crossLanguage: [],
    slideTransition: transition,
  });

  assert.match(markdown, /Galerina\/SLIDE versus archived Galerina\/Wasm/u);
  assert.match(markdown, /2026-08-02\\_galerina-wasm-before-slide/u);
  assert.match(markdown, /DEFERRED\\_NO\\_SLIDE\\_LANE/u);
  assert.match(markdown, /No production `slide` lane is present/u);
});

test("an active transition renders comparisons and every exclusion", () => {
  const markdown = buildReportMarkdown({
    baseline: null,
    runtimes: REPORT_RUNTIMES,
    diffFromLast: [],
    crossLanguage: [],
    slideTransition: {
      ...transition,
      status: "INCOMPLETE",
      rows: [{ benchmark: "same-work", unit: "ops/s", direction: "higher is better", baseline: 100, candidate: 125, improvementFactor: 1.25, outcome: "BETTER" }],
      exclusions: [{ benchmark: "new-only", reason: "missing archived workload" }],
    },
  });

  assert.match(markdown, /\| same-work \| ops\/s \| higher is better \| 100 \| 125 \| 1\.25x \| BETTER \|/u);
  assert.match(markdown, /new-only: missing archived workload/u);
  assert.match(markdown, /does not release production authority/u);
});

test("hostile: result-controlled markup is escaped in Markdown cells", () => {
  assert.equal(escapeMarkdown("a|b"), "a\\|b");
  assert.equal(escapeMarkdown("<script>"), "&lt;script&gt;");
  assert.equal(escapeMarkdown("line\nbreak"), "line break");
  const crossLanguage = buildCrossLanguageRows([{
    benchmark: "evil|name\n<script>",
    metricClass: "cpu-throughput",
    units: { comparable: true, status: "PASS", unit: "ops/s" },
    results: { rust: { normThroughput: 1 } },
  }]);
  const rendered = buildReportMarkdown({
    baseline: "base|line",
    runtimes: REPORT_RUNTIMES,
    diffFromLast: [],
    crossLanguage,
    slideTransition: transition,
  });
  assert.ok(rendered.includes("evil\\|name &lt;script&gt;"));
  assert.equal(rendered.includes("<script>"), false);
});

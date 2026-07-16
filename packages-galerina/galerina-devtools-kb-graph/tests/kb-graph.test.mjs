// @ts-check
// =============================================================================
// kb-graph.test.mjs — unit tests for the Galerina KB Graph scanner/builder
// =============================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dir, "..", "..", "..");
// KB relocated to sibling ../ZTF-Knowledge-Bases; env override wins, in-repo docs used if restored.
const KB_DIR = process.env.GALERINA_KB_DIR
  ? resolve(process.env.GALERINA_KB_DIR)
  : existsSync(join(PROJECT_ROOT, "docs", "Knowledge-Bases"))
    ? join(PROJECT_ROOT, "docs", "Knowledge-Bases")
    : join(PROJECT_ROOT, "..", "ZTF-Knowledge-Bases");

// Dynamic imports of compiled output (run after `npm run build`)
const { scanKBDirectory } = await import("../dist/scanner.js");
const { buildKBGraph }    = await import("../dist/graph.js");
const { generateDOT, generateJSON, generateMarkdownReport } = await import("../dist/reporter.js");

// ── Scan once, reuse ─────────────────────────────────────────────────────────
const scanResult = scanKBDirectory(KB_DIR);
const graph      = buildKBGraph(scanResult);

describe("scanner — basic discovery", () => {
  test("finds all .md files in KB directory (>=30)", () => {
    assert.ok(scanResult.docs.length >= 30,
      `expected >=30 docs, got ${scanResult.docs.length}`);
  });

  test("every doc has a non-empty id", () => {
    for (const doc of scanResult.docs) {
      assert.ok(doc.id.length > 0, `doc with empty id: ${doc.path}`);
    }
  });

  test("every doc has a non-empty path", () => {
    for (const doc of scanResult.docs) {
      assert.ok(doc.path.length > 0);
    }
  });

  test("word counts are positive", () => {
    for (const doc of scanResult.docs) {
      assert.ok(doc.wordCount > 0, `${doc.id} has 0 words`);
    }
  });
});

describe("scanner — metadata extraction", () => {
  test("extracts title from first # heading", () => {
    // KNOWLEDGE-BASE-INDEX.md or architecture-charter.md should have a title
    const titled = scanResult.docs.filter(d => d.title !== d.id);
    assert.ok(titled.length > 0, "no docs had a title extracted from headings");
  });

  test("extracts FUNGI codes from governance-rules doc (>=20 codes)", () => {
    const gov = scanResult.docs.find(d => d.id.includes("governance-rules"));
    if (!gov) {
      // Non-fatal: doc might not be present
      console.log("  (skipped — galerina-governance-rules.md not found)");
      return;
    }
    assert.ok(gov.lnlCodes.length >= 20,
      `expected >=20 FUNGI codes, got ${gov.lnlCodes.length}`);
  });

  test("FUNGI codes match expected pattern FUNGI-XXX-NNN", () => {
    const re = /^FUNGI-[A-Z]+-\d+$/;
    for (const doc of scanResult.docs) {
      for (const code of doc.lnlCodes) {
        assert.ok(re.test(code), `unexpected FUNGI code format: "${code}" in ${doc.id}`);
      }
    }
  });

  test("lastModified is a Date instance", () => {
    for (const doc of scanResult.docs) {
      assert.ok(doc.lastModified instanceof Date, `${doc.id}: lastModified is not a Date`);
    }
  });
});

describe("graph — structure", () => {
  test("graph has same number of nodes as scanned docs", () => {
    assert.equal(graph.nodes.length, scanResult.docs.length);
  });

  test("orphans array exists and is an array", () => {
    assert.ok(Array.isArray(graph.orphans));
  });

  test("staleLinks array exists and is an array", () => {
    assert.ok(Array.isArray(graph.staleLinks));
  });

  test("stats.totalDocs matches nodes length", () => {
    assert.equal(graph.stats.totalDocs, graph.nodes.length);
  });

  test("stats.totalEdges matches edges length", () => {
    assert.equal(graph.stats.totalEdges, graph.edges.length);
  });

  test("stats.orphanCount matches orphans array length", () => {
    assert.equal(graph.stats.orphanCount, graph.orphans.length);
  });

  test("all edge from/to ids are non-empty strings", () => {
    for (const edge of graph.edges) {
      assert.ok(edge.from.length > 0, "edge.from is empty");
      assert.ok(edge.to.length > 0,   "edge.to is empty");
    }
  });

  test("all edge targets exist in the node set (no stale edges in graph.edges)", () => {
    const nodeIds = new Set(graph.nodes.map(n => n.id));
    for (const edge of graph.edges) {
      assert.ok(nodeIds.has(edge.to),
        `edge to "${edge.to}" does not exist in nodes (from "${edge.from}")`);
    }
  });
});

describe("reporter — output formats", () => {
  test("generateDOT produces a digraph string", () => {
    const dot = generateDOT(graph);
    assert.ok(dot.startsWith("digraph KBGraph {"), "DOT missing digraph header");
    assert.ok(dot.includes("rankdir=LR"), "DOT missing rankdir");
    assert.ok(dot.trimEnd().endsWith("}"), "DOT missing closing brace");
  });

  test("generateJSON produces valid JSON with nodes and edges arrays", () => {
    const json = generateJSON(graph);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.nodes), "JSON nodes is not an array");
    assert.ok(Array.isArray(parsed.edges), "JSON edges is not an array");
    assert.equal(parsed.nodes.length, graph.nodes.length);
  });

  test("generateMarkdownReport contains expected sections", () => {
    const md = generateMarkdownReport(graph, "2026-06-05");
    assert.ok(md.includes("# Galerina KB Graph Report"),       "missing title");
    assert.ok(md.includes("## Stats"),                       "missing Stats section");
    assert.ok(md.includes("## Document Registry"),           "missing Document Registry section");
    assert.ok(md.includes("## Orphaned Documents"),          "missing Orphaned Documents section");
    assert.ok(md.includes("## Stale Links"),                 "missing Stale Links section");
  });

  test("generateMarkdownReport stats line includes correct doc count", () => {
    const md = generateMarkdownReport(graph, "2026-06-05");
    assert.ok(md.includes(`Docs: ${graph.stats.totalDocs}`),
      `stats line does not show correct doc count ${graph.stats.totalDocs}`);
  });
});

describe("scanner — [[wikilink]] cross-references (false-orphan fix, 2026-07-16)", () => {
  // The KB's wiki-style [[doc-id]] refs (237 files) were invisible to the scanner, so a doc
  // referenced ONLY by wikilinks was reported as a false orphan. Pinned both ways on a controlled
  // fixture: a resolving [[id]] is an inbound MENTION (kills the orphan); a dangling [[id]] marks
  // a doc worth writing later (house convention) and must NOT enter the stale-link count; and a
  // genuinely unreferenced doc still fires the orphan signal (the detector is not neutered).
  const dir = mkdtempSync(join(tmpdir(), "kb-graph-wikilink-"));
  writeFileSync(join(dir, "alpha.md"), "# Alpha\n\nSee [[beta]] for detail; [[ghost-doc]] is planned.\n");
  writeFileSync(join(dir, "beta.md"), "# Beta\n\nStands alone.\n");
  writeFileSync(join(dir, "gamma.md"), "# Gamma\n\nNothing references me.\n");
  const g = buildKBGraph(scanKBDirectory(dir));
  rmSync(dir, { recursive: true, force: true });

  test("a resolving [[wikilink]] counts as an inbound edge (target is NOT an orphan)", () => {
    assert.ok(!g.orphans.includes("beta"), `beta is wikilinked from alpha yet reported orphaned`);
    const e = g.edges.find(x => x.from === "alpha" && x.to === "beta");
    assert.ok(e, "alpha→beta wikilink edge missing");
    assert.equal(e.kind, "mention", "a wikilink must be a mention, never a 'link'");
  });

  test("a dangling [[wikilink]] is NOT a stale link (marks a doc worth writing later)", () => {
    assert.ok(!g.staleLinks.some(s => s.includes("ghost-doc")),
      "dangling [[ghost-doc]] wrongly entered the stale-link count");
  });

  test("orphan detection still fires on a genuinely unreferenced doc (non-vacuous)", () => {
    assert.ok(g.orphans.includes("gamma"), "gamma has no inbound refs and must be an orphan");
  });
});

describe("reporter — path-leak redaction (ZT-17)", () => {
  // A generated report is git-TRACKED and scanned by audit-path-leak, but the KB source carries
  // a known, owner-gated absolute-path backlog, so the reporter MUST redact local paths at emit
  // time (else a fresh regen surfaces a leak into the committed report). Controlled, non-vacuous
  // input: fields that definitely carry a leak in each emitted output.
  /** @type {any} */
  const leakyGraph = {
    nodes: [{
      id: "leaky-doc",
      title: "Leaky C:\\Users\\example\\Documents title", // path-leak-audit:allow — redaction-test fixture
      status: "READ-ONLY; nothing in 'C:\\Users\\example\\Documents\\GitHub' is writable", // path-leak-audit:allow
      lnlCodes: [],
    }],
    edges: [],
    orphans: [],
    staleLinks: ["from -> /home/example/secret/roadmap.md"],
    stats: { totalDocs: 1, totalEdges: 0, totalFungiCodes: 0, orphanCount: 0, staleLinkCount: 1 },
  };

  test("markdown report redacts Windows + POSIX local paths and keeps the placeholder", () => {
    const md = generateMarkdownReport(leakyGraph, "2026-01-01");
    assert.ok(!/[A-Za-z]:\\+Users\\+/i.test(md), "Windows user-home path leaked into the report");
    assert.ok(!/\/home\/example/i.test(md),      "POSIX home path leaked into the report");
    assert.ok(md.includes("<local-path>"),       "redaction placeholder missing — redaction did not fire");
  });

  test("JSON output redacts local paths too", () => {
    const json = generateJSON(leakyGraph);
    assert.ok(!/[A-Za-z]:\\+Users\\+/i.test(json), "Windows path leaked into JSON");
    assert.ok(!/\/home\/example/i.test(json),       "POSIX path leaked into JSON");
  });

  test("clean input is left untouched (no over-redaction)", () => {
    /** @type {any} */
    const cleanGraph = {
      nodes: [{ id: "ok-doc", title: "Fine", version: "1.0", status: "authoritative", lnlCodes: [] }],
      edges: [], orphans: [], staleLinks: [],
      stats: { totalDocs: 1, totalEdges: 0, totalFungiCodes: 0, orphanCount: 0, staleLinkCount: 0 },
    };
    const md = generateMarkdownReport(cleanGraph, "2026-01-01");
    assert.ok(!md.includes("<local-path>"), "clean input should not produce a redaction placeholder");
    assert.ok(md.includes("authoritative"), "clean status text should survive verbatim");
  });
});

describe("scanner — fenced/inline code masking (rebrand-report parse artifacts, 2026-07-16)", () => {
  // Dated provenance docs quote source lines + JSON payloads verbatim (the rebrand report
  // uses inline `code` spans; other KB docs use ``` fences). Link-shaped text inside those
  // regions is DATA: the extractor read it as live hyperlinks and invented 4 stale links
  // (e.g. rebrand-report → LLN-AMD-024-tmf-confidentiality). The provenance doc must never
  // be edited, so the EXTRACTOR skips code regions. Pinned fires-on-bad both ways: the
  // planted link inside a fence / inline span is NOT extracted, while the same link planted
  // unfenced IS (masking neither neuters extraction nor the stale detector).
  const dir = mkdtempSync(join(tmpdir(), "kb-graph-codemask-"));
  writeFileSync(join(dir, "real-target.md"), "# Real Target\n\nStands alone.\n");
  writeFileSync(join(dir, "mention-doc.md"), "# Mention Doc\n\nStands alone.\n");
  writeFileSync(join(dir, "source.md"), [
    "# Source",
    "",
    "Live link: [real](real-target.md); live wikilink: [[real-target]].",
    "Broken live hyperlink: [gone](unfenced-missing.md).",
    "Backtick mention convention still counts: `mention-doc.md`.",
    "",
    "```json",
    "{\"quote\": \"see ['fake'](fenced-fake-target.md) and [[fenced-fake-wiki]]\"}",
    "```",
    "",
    "Quoted source line: `the ['x'](span-fake-target.md) blueprint` and `[[span-fake-wiki]]`.",
    "",
  ].join("\n"));
  const scan = scanKBDirectory(dir);
  const g2 = buildKBGraph(scan);
  rmSync(dir, { recursive: true, force: true });

  test("a link planted inside a fenced code block is NOT extracted", () => {
    assert.ok(!scan.edges.some(e => e.to === "fenced-fake-target"),
      "fenced [text](file.md) was extracted as a live link");
    assert.ok(!scan.edges.some(e => e.to === "fenced-fake-wiki"),
      "fenced [[wikilink]] was extracted as a live mention");
  });

  test("a link planted inside an inline code span is NOT extracted (the rebrand-report class)", () => {
    assert.ok(!scan.edges.some(e => e.to === "span-fake-target"),
      "inline-span [text](file.md) was extracted as a live link");
    assert.ok(!scan.edges.some(e => e.to === "span-fake-wiki"),
      "inline-span [[wikilink]] was extracted as a live mention");
  });

  test("fires-on-bad: the same planted links OUTSIDE code regions ARE extracted", () => {
    const live = scan.edges.find(e => e.from === "source" && e.to === "real-target");
    assert.ok(live, "unfenced [real](real-target.md) must be extracted");
    assert.equal(live.kind, "link", "an unfenced [](…) hyperlink must keep kind 'link'");
    assert.ok(scan.edges.some(e => e.from === "source" && e.to === "unfenced-missing" && e.kind === "link"),
      "the unfenced broken hyperlink must still be extracted (it is the stale detector's input)");
  });

  test("the stale-link detector still fires on the live broken link — and ONLY on it", () => {
    assert.equal(g2.staleLinks.length, 1,
      `expected exactly 1 stale link (the unfenced one), got: ${JSON.stringify(g2.staleLinks)}`);
    assert.ok(g2.staleLinks[0].includes("unfenced-missing"),
      "the one stale link must be the live broken hyperlink, not a code-region artifact");
  });

  test("the backtick `file.md` MENTION convention still reads raw text (not masked away)", () => {
    const m = scan.edges.find(e => e.from === "source" && e.to === "mention-doc");
    assert.ok(m, "`mention-doc.md` backtick mention edge missing — masking must not blind the mention extractor");
    assert.equal(m.kind, "mention");
    assert.ok(!g2.orphans.includes("mention-doc"), "mention-doc lost its inbound mention edge");
  });
});

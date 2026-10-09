// links.test.ts — known-answer tests for broken-link classification and repair.
//
// The classifier's most important property is a REFUSAL: it must not resolve an ambiguous
// basename. A repairer that picks between two candidate documents is wrong half the time,
// and a wrong link that resolves is invisible — strictly worse than a visibly broken one.

import { strict as assert } from "node:assert";
import test from "node:test";

import {
  classifyBroken,
  isExternalHref,
  isPrivatePath,
  scanText,
  scanPrivateRefs,
  repairText,
  MD_LINK,
} from "../src/query/links.ts";
import type { BrokenLink } from "../src/query/links.ts";

const REPO = "ZTF-Knowledge-Bases";

const nameIndex = new Map<string, string[]>([
  ["RD-0842-x.md", ["research/rd/RD-0842-x.md"]],
  ["charter.md", ["reference/language/charter.md"]],
  ["dup.md", ["a/dup.md", "b/dup.md"]],
  ["logo.png", ["assets/logo.png"]],
]);

test("external hrefs are never broken links", () => {
  for (const h of [
    "https://example.com/a.md",
    "http://example.com",
    "mailto:x@y.z",
    "#section",
    "file:///C:/x.md",
    "C:\\x.md",
    "/etc/x.md",
  ]) {
    assert.equal(isExternalHref(h), true, h);
  }
  assert.equal(isExternalHref("../a.md"), false);
  assert.equal(isExternalHref("a.md"), false);
});

test("placeholder prose is classified, not treated as a real target", () => {
  for (const h of ["file.md", "path/to/thing.md", "<name>.md", "your-doc.md", "example.md"]) {
    assert.equal(classifyBroken(h, "", nameIndex, REPO).cls, "PLACEHOLDER", h);
  }
});

test("a link that leaves the repo and re-enters by name resolves to a plain relative path", () => {
  const r = classifyBroken("../../ZTF-Knowledge-Bases/charter.md", "coordination/done", nameIndex, REPO);
  assert.equal(r.cls, "SELF_PREFIX");
  assert.equal(r.target, "reference/language/charter.md");
});

test("a self-prefixed link whose inner path is already correct keeps that path", () => {
  const r = classifyBroken(
    "../../ZTF-Knowledge-Bases/research/rd/RD-0842-x.md",
    "papers",
    nameIndex,
    REPO,
  );
  assert.equal(r.cls, "SELF_PREFIX");
  assert.equal(r.target, "research/rd/RD-0842-x.md");
});

test("a uniquely-named file that moved is resolved", () => {
  const r = classifyBroken("RD-0842-x.md", "papers", nameIndex, REPO);
  assert.equal(r.cls, "MOVED");
  assert.equal(r.target, "research/rd/RD-0842-x.md");
});

test("non-markdown targets participate: links point at images too", () => {
  const r = classifyBroken("logo.png", "docs", nameIndex, REPO);
  assert.equal(r.cls, "MOVED");
  assert.equal(r.target, "assets/logo.png");
});

test("an ambiguous BARE basename is REFUSED and carries no target", () => {
  const r = classifyBroken("dup.md", "", nameIndex, REPO);
  assert.equal(r.cls, "AMBIGUOUS");
  assert.equal(r.target, undefined, "AMBIGUOUS must never carry a target");
  assert.deepEqual(r.candidates, ["a/dup.md", "b/dup.md"]);
});

test("a PATHED link to a common basename is MISSING, not ambiguous", () => {
  // README.md is the commonest basename in any repository. Matching it tree-wide made an
  // external `bench/README.md` report 27 candidates, which buried the real findings.
  const idx = new Map<string, string[]>([
    ["README.md", ["a/README.md", "b/README.md", "c/README.md"]],
  ]);
  assert.equal(classifyBroken("bench/README.md", "", idx, REPO).cls, "MISSING");
  assert.equal(classifyBroken("./README.md", "rd-absorbed/x", idx, REPO).cls, "MISSING");
  assert.equal(classifyBroken("../../../other-repo/README.md", "x", idx, REPO).cls, "MISSING");
  // CONTROL: the bare form still reports ambiguity, so this rule narrowed the class
  // rather than deleting it.
  assert.equal(classifyBroken("README.md", "", idx, REPO).cls, "AMBIGUOUS");
});

test("a pathed link still resolves when the basename is unique", () => {
  const r = classifyBroken("old/place/RD-0842-x.md", "papers", nameIndex, REPO);
  assert.equal(r.cls, "MOVED");
  assert.equal(r.target, "research/rd/RD-0842-x.md");
});

test("elided prose is a placeholder, never a path", () => {
  for (const h of ["...", "../../...", "../../../...a", "a/b/..."]) {
    assert.equal(classifyBroken(h, "", nameIndex, REPO).cls, "PLACEHOLDER", h);
  }
  // CONTROL: a real relative path that merely starts with dots is NOT an ellipsis.
  assert.notEqual(classifyBroken("../charter.md", "x", nameIndex, REPO).cls, "PLACEHOLDER");
});

test("a target that exists only as its -PRIVATE twin is surfaced, not repaired", () => {
  const privateFixture = ["secret", "-PRIVATE", ".md"].join("");
  const idx = new Map<string, string[]>([
    [privateFixture, [`private/reference/galerina/${privateFixture}`]],
  ]);
  const r = classifyBroken("secret.md", "reference/galerina", idx, REPO);
  assert.equal(r.cls, "PRIVATE_TWIN");
  assert.equal(r.target, undefined, "repointing a public doc at a PRIVATE one is a human decision");
  assert.deepEqual(r.candidates, [`private/reference/galerina/${privateFixture}`]);
});

test("CONTROL: --fix leaves a PRIVATE_TWIN untouched, --delink-missing does not resurrect it", () => {
  const privateFixture = ["secret", "-PRIVATE", ".md"].join("");
  const findings: BrokenLink[] = [
    { file: "x.md", href: "secret.md", cls: "PRIVATE_TWIN", candidates: [`private/${privateFixture}`] },
  ];
  const before = "see [s](secret.md)";
  assert.equal(repairText("x.md", before, findings).text, before);
  assert.equal(repairText("x.md", before, findings, true).text, before);
});

test("--delink-missing converts MISSING to a code span, and only when asked", () => {
  const findings: BrokenLink[] = [{ file: "a.md", href: "../../other-repo/x.md", cls: "MISSING" }];
  const src = "see [x](../../other-repo/x.md)";
  const off = repairText("a.md", src, findings);
  assert.equal(off.text, src, "MISSING must survive a plain --fix");
  assert.equal(off.delinked, 0);
  const on = repairText("a.md", src, findings, true);
  assert.equal(on.delinked, 1);
  assert.match(on.text, /`\.\.\/\.\.\/other-repo\/x\.md`/, "the path must survive as text");
  assert.doesNotMatch(on.text, /\]\(/);
});

test("an unknown basename is MISSING, not guessed", () => {
  assert.equal(classifyBroken("never-existed.md", "", nameIndex, REPO).cls, "MISSING");
  assert.equal(
    classifyBroken("../../ZTF-Knowledge-Bases/gone.md", "x", nameIndex, REPO).cls,
    "MISSING",
  );
});

test("scanText reports only links that do not resolve", () => {
  const present = new Set(["docs/real.md", "research/rd/RD-0842-x.md"]);
  const text = [
    "[ok](real.md)",
    "[gone](vanished.md)",
    "[ext](https://example.com/a.md)",
    "[anchor](#x)",
  ].join("\n");
  const out = scanText("docs/page.md", text, (p) => present.has(p), nameIndex, REPO);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.href, "vanished.md");
  assert.equal(out[0]?.cls, "MISSING");
});

test("a link to a DIRECTORY is not broken", () => {
  // The caller's existence predicate must cover directories, not only files. Building it
  // from file paths alone reported 17 false positives in one repo's own README.
  const present = new Set(["research/rd/RD-1.md", "research/rd", "research"]);
  const out = scanText(
    "README.md",
    "[rd](research/rd/) and [top](research/)",
    (p) => present.has(p),
    nameIndex,
    REPO,
  );
  assert.equal(out.length, 0, "directory targets must resolve");
});

test("CONTROL: a directory that does NOT exist is still reported", () => {
  const present = new Set(["research/rd/RD-1.md", "research/rd", "research"]);
  const out = scanText("README.md", "[x](nope/)", (p) => present.has(p), nameIndex, REPO);
  assert.equal(out.length, 1, "the directory check must not blanket-pass every trailing slash");
});

test("a link that escapes the scanned root is checked, not assumed missing", () => {
  // Sibling repositories in one workspace are linked this way constantly. An index built
  // from the scanned root cannot see them, so the caller's predicate has to answer for
  // out-of-root paths. Reporting them missing produced 125 false positives on this estate,
  // and acting on those would have destroyed 125 working links.
  const exists = (p: string) => p === "../Sibling/docs/x.md";
  const ok = scanText("docs/a.md", "[x](../../Sibling/docs/x.md)", exists, nameIndex, REPO);
  assert.equal(ok.length, 0, "an out-of-root target that exists is not broken");

  // CONTROL: an out-of-root target that does NOT exist is still reported, so the rule
  // did not blanket-pass everything that leaves the root.
  const bad = scanText("docs/a.md", "[x](../../Sibling/docs/gone.md)", exists, nameIndex, REPO);
  assert.equal(bad.length, 1);
  assert.equal(bad[0]?.cls, "MISSING");
});

test("scanText keeps the anchor out of the existence check", () => {
  const present = new Set(["docs/real.md"]);
  const out = scanText("docs/p.md", "[a](real.md#deep-section)", (p) => present.has(p), nameIndex, REPO);
  assert.equal(out.length, 0, "an anchor must not make a resolvable file look missing");
});

test("repairText rewrites MOVED relative to the containing file, preserving the anchor", () => {
  const findings: BrokenLink[] = [
    { file: "papers/p.md", href: "RD-0842-x.md#s3", cls: "MOVED", target: "research/rd/RD-0842-x.md" },
  ];
  const r = repairText("papers/p.md", "see [x](RD-0842-x.md#s3)", findings);
  assert.equal(r.text, "see [x](../research/rd/RD-0842-x.md#s3)");
  assert.equal(r.repaired, 1);
});

test("repairText de-links a placeholder instead of pointing it somewhere", () => {
  const findings: BrokenLink[] = [{ file: "t.md", href: "file.md", cls: "PLACEHOLDER" }];
  const r = repairText("t.md", "use [the doc](file.md) here", findings);
  assert.equal(r.delinked, 1);
  assert.equal(r.repaired, 0);
  assert.match(r.text, /`file\.md`/);
  assert.doesNotMatch(r.text, /\]\(/, "the placeholder must no longer be a link");
});

test("CONTROL: repairText leaves AMBIGUOUS untouched", () => {
  const findings: BrokenLink[] = [
    { file: "x.md", href: "dup.md", cls: "AMBIGUOUS", candidates: ["a/dup.md", "b/dup.md"] },
  ];
  const before = "see [d](dup.md)";
  const r = repairText("x.md", before, findings);
  assert.equal(r.text, before, "an ambiguous link must survive --fix unchanged");
  assert.equal(r.repaired, 0);
});

test("CONTROL: repairText is capable of changing text at all", () => {
  // Without this, the assertion above would pass for a repairer that does nothing.
  const findings: BrokenLink[] = [
    { file: "x.md", href: "dup.md", cls: "MOVED", target: "a/dup.md" },
  ];
  const r = repairText("x.md", "see [d](dup.md)", findings);
  assert.equal(r.repaired, 1);
  assert.notEqual(r.text, "see [d](dup.md)");
});

test("repair is idempotent: a second pass finds nothing to change", () => {
  const findings: BrokenLink[] = [
    { file: "papers/p.md", href: "RD-0842-x.md", cls: "MOVED", target: "research/rd/RD-0842-x.md" },
  ];
  const first = repairText("papers/p.md", "[x](RD-0842-x.md)", findings);
  const second = repairText("papers/p.md", first.text, findings);
  assert.equal(second.repaired, 0);
  assert.equal(second.text, first.text);
});

const privateDocName = (stem: string): string => `${stem}-PRIVATE${".md"}`;

test("a resolved public -> never-public link is reported", () => {
  // Not broken, which is exactly why the broken-link report can never see it. It works
  // today and leaks scope the moment the public document is mirrored.
  const target = `private/reference/${privateDocName("x")}`;
  const exists = (p: string) => p === target;
  const out = scanPrivateRefs(
    "reference/galerina/doc.md",
    `[x](../../${target})`,
    exists,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.target, target);
});

test("private -> private is in scope and not reported", () => {
  const target = `private/reference/${privateDocName("x")}`;
  const exists = (p: string) => p === target;
  const out = scanPrivateRefs(
    `private/reference/${privateDocName("other")}`,
    `[x](${privateDocName("x")})`,
    exists,
  );
  assert.equal(out.length, 0);
});

test("CONTROL: a public -> public link is not reported as a scope leak", () => {
  const exists = (p: string) => p === "reference/galerina/other.md";
  const out = scanPrivateRefs("reference/galerina/doc.md", "[x](other.md)", exists);
  assert.equal(out.length, 0, "the check must not flag every resolved link");
});

test("a BROKEN link into private/ is left to the broken-link report", () => {
  const out = scanPrivateRefs("doc.md", `[x](private/${privateDocName("gone")})`, () => false);
  assert.equal(out.length, 0);
});

test("isPrivatePath recognises both the tag and the tree", () => {
  assert.equal(isPrivatePath(`a/${privateDocName("b")}`), true);
  assert.equal(isPrivatePath("private/a/b.md"), true);
  assert.equal(isPrivatePath("a/private/b.md"), true);
  assert.equal(isPrivatePath("a/b.md"), false);
  assert.equal(isPrivatePath("a/privateer/b.md"), false, "the boundary is the slash");
});

test("MD_LINK does not match a bare code span or a reference definition", () => {
  MD_LINK.lastIndex = 0;
  assert.equal([..."`a.md` and [ref]: b.md".matchAll(MD_LINK)].length, 0);
});

test("scanText ignores links inside Markdown code spans and fences", () => {
  const text = [
    "`[inline](inline.md)`",
    "````text",
    "[transcript](./00001/0001.jpg)",
    "```",
    "````",
    "~~~md",
    "[tilde](tilde.md)",
    "~~~",
    "[outside](outside.md)",
    "```text\r\n[unclosed](unclosed.md)",
  ].join("\r\n");

  const out = scanText("research/rd/RD-1.md", text, () => false, new Map(), REPO);
  assert.deepEqual(out.map((finding) => finding.href), ["outside.md"]);
});

test("scanText still checks a Markdown link whose label contains inline code", () => {
  const out = scanText(
    "spec/page.md",
    "See [`external-repos-analysis.md`](../research/external-repos-analysis.md).",
    () => false,
    new Map(),
    REPO,
  );

  assert.equal(out.length, 1, "inline code in the label must not hide the live link target");
  assert.equal(out[0]?.href, "../research/external-repos-analysis.md");
  assert.equal(out[0]?.cls, "MISSING");
});

test("scanPrivateRefs ignores private links inside Markdown code", () => {
  const privateTarget = `private/reference/${privateDocName("secret")}`;
  const text = [
    "````text",
    `[inert](../../${privateTarget})`,
    "````",
    `[live](../../${privateTarget})`,
  ].join("\n");

  const out = scanPrivateRefs("research/rd/RD-1.md", text, (path) => path === privateTarget);
  assert.deepEqual(out.map((finding) => finding.href), [`../../${privateTarget}`]);
});

test("repairText rewrites only live Markdown links, never code examples", () => {
  const href = "RD-0842-x.md";
  const text = [
    `\`[inline](${href})\``,
    "````text",
    `[transcript](${href})`,
    "````",
    `[live](${href})`,
  ].join("\n");
  const findings: BrokenLink[] = [
    { file: "papers/p.md", href, cls: "MOVED", target: "research/rd/RD-0842-x.md" },
  ];

  const out = repairText("papers/p.md", text, findings);
  assert.equal(out.repaired, 1);
  assert.match(out.text, /`\[inline\]\(RD-0842-x\.md\)`/);
  assert.match(out.text, /\[transcript\]\(RD-0842-x\.md\)/);
  assert.match(out.text, /\[live\]\(\.\.\/research\/rd\/RD-0842-x\.md\)/);
});
